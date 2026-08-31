"""Daily Standup Summary router — auto-generates standup reports from task activity."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload
from datetime import date, datetime, timedelta

from .. import models
from ..database import get_db
from ..deps import get_current_user, require_roles

router = APIRouter(prefix="/api/standup", tags=["Standup"])


def _yesterday() -> date:
    """Return yesterday's date."""
    return date.today() - timedelta(days=1)


def _build_developer_summary(developer_id: int, db: Session, target_date: date | None = None) -> dict:
    """Build a standup summary dict for a single developer."""
    developer = db.query(models.Developer).filter(models.Developer.id == developer_id).first()
    if not developer:
        return {"developer_id": developer_id, "developer_name": "Unknown", "yesterday": [], "today": [], "blockers": []}

    yesterday = target_date or _yesterday()

    # --- Yesterday: task activities from yesterday ---
    # Include activities where:
    # 1. activity.developer_id matches this developer, OR
    # 2. activity.created_by_id matches the developer's user account, OR
    # 3. activity is on a task assigned to this developer (task.developer_id)
    user_id = developer.user_account.id if developer.user_account else None
    # Get task IDs assigned to this developer
    dev_task_ids = [t.id for t in db.query(models.Task.id).filter(models.Task.developer_id == developer_id).all()]

    # Build OR conditions
    conditions = [models.TaskActivity.developer_id == developer_id]
    if user_id:
        conditions.append(models.TaskActivity.created_by_id == user_id)
    if dev_task_ids:
        conditions.append(models.TaskActivity.task_id.in_(dev_task_ids))

    activities = (
        db.query(models.TaskActivity)
        .options(joinedload(models.TaskActivity.task))
        .filter(
            or_(*conditions),
            models.TaskActivity.activity_date == yesterday,
        )
        .order_by(models.TaskActivity.id.desc())
        .all()
    )

    yesterday_items = []
    for a in activities:
        task = a.task
        yesterday_items.append({
            "activity_id": a.id,
            "task_id": a.task_id,
            "task_code": task.task_code if task else None,
            "task_description": task.description if task else None,
            "subject": task.subject if task else None,
            "notes": a.description,
            "hours_spent": a.hours_spent,
            "percentage": a.percentage,
        })

    # --- Today: tasks currently "In Progress" assigned to this developer ---
    in_progress_tasks = (
        db.query(models.Task)
        .filter(
            models.Task.developer_id == developer_id,
            models.Task.status == "In Progress",
        )
        .order_by(models.Task.priority.desc(), models.Task.end_date.asc())
        .all()
    )

    today_items = []
    for t in in_progress_tasks:
        today_items.append({
            "task_id": t.id,
            "task_code": t.task_code,
            "description": t.description,
            "subject": t.subject,
            "priority": t.priority,
            "end_date": str(t.end_date) if t.end_date else None,
            "percentage": t.percentage,
        })

    # --- Blockers: tasks "On Hold" OR tasks with unresolved dependencies ---
    on_hold_tasks = (
        db.query(models.Task)
        .filter(
            models.Task.developer_id == developer_id,
            models.Task.status == "On Hold",
        )
        .all()
    )

    # Tasks that have dependencies which are not yet completed
    blocked_by_deps = (
        db.query(models.Task)
        .join(models.TaskDependency, models.TaskDependency.task_id == models.Task.id)
        .join(
            models.Task.__table__.alias("dep_task"),
            models.TaskDependency.depends_on_id == models.Task.id,
        )
        .filter(
            models.Task.developer_id == developer_id,
            models.Task.status != "Completed",
            models.Task.status != "On Hold",
        )
        .all()
    )

    # Simpler approach: query dependencies for this developer's non-completed tasks
    dev_tasks_with_deps = (
        db.query(models.TaskDependency)
        .join(models.Task, models.TaskDependency.task_id == models.Task.id)
        .filter(
            models.Task.developer_id == developer_id,
            models.Task.status.notin_(["Completed", "Cancelled"]),
        )
        .all()
    )

    blocked_task_ids = set()
    for dep in dev_tasks_with_deps:
        depends_on_task = db.query(models.Task).filter(models.Task.id == dep.depends_on_id).first()
        if depends_on_task and depends_on_task.status not in ("Completed", "Cancelled"):
            blocked_task_ids.add(dep.task_id)

    blocked_tasks = (
        db.query(models.Task)
        .filter(models.Task.id.in_(blocked_task_ids))
        .all()
    ) if blocked_task_ids else []

    # Combine on-hold + dependency-blocked (deduplicate)
    blocker_ids_seen = set()
    blockers = []

    for t in on_hold_tasks:
        if t.id not in blocker_ids_seen:
            blocker_ids_seen.add(t.id)
            blockers.append({
                "task_id": t.id,
                "task_code": t.task_code,
                "description": t.description,
                "subject": t.subject,
                "status": t.status,
                "reason": "On Hold",
            })

    for t in blocked_tasks:
        if t.id not in blocker_ids_seen:
            blocker_ids_seen.add(t.id)
            blockers.append({
                "task_id": t.id,
                "task_code": t.task_code,
                "description": t.description,
                "subject": t.subject,
                "status": t.status,
                "reason": "Blocked by dependency",
            })

    # --- Recent Commits from the standup date ---
    recent_commit_rows = (
        db.query(models.Commit)
        .options(joinedload(models.Commit.repo))
        .filter(
            models.Commit.developer_id == developer_id,
            models.Commit.committed_at >= datetime.combine(yesterday, datetime.min.time()),
            models.Commit.committed_at <= datetime.combine(yesterday, datetime.max.time()),
        )
        .order_by(models.Commit.committed_at.desc())
        .limit(10)
        .all()
    )
    recent_commits = [
        {
            "short_hash": c.short_hash or (c.commit_hash[:7] if c.commit_hash else ""),
            "message": c.message,
            "repo_name": (c.repo.repo_name or c.repo.repo_slug) if c.repo else None,
        }
        for c in recent_commit_rows
    ]

    return {
        "developer_id": developer_id,
        "developer_name": developer.name,
        "yesterday": yesterday_items,
        "today": today_items,
        "blockers": blockers,
        "recent_commits": recent_commits,
    }


def _format_standup_text(summary: dict) -> str:
    """Format a standup summary as plain text suitable for Teams/Slack."""
    lines = []
    lines.append(f"📋 Daily Standup — {summary['developer_name']}")
    lines.append(f"   Date: {date.today().strftime('%A, %d %B %Y')}")
    lines.append("")

    lines.append("🔙 What I did yesterday:")
    if summary["yesterday"]:
        for item in summary["yesterday"]:
            task_label = item["task_code"] or "N/A"
            subject = item.get("subject") or item.get("task_description") or ""
            lines.append(f"  • [{task_label}] {subject}")
            if item["notes"]:
                lines.append(f"    → {item['notes']}")
            if item["hours_spent"]:
                lines.append(f"    ({item['hours_spent']}h spent)")
    else:
        lines.append("  • No activities logged yesterday")

    lines.append("")
    lines.append("▶️ What I'm working on today:")
    if summary["today"]:
        for item in summary["today"]:
            subject = item.get("subject") or item.get("description") or ""
            lines.append(f"  • [{item['task_code']}] {subject} (Priority: {item['priority']}, {item['percentage']:.0f}% done)")
    else:
        lines.append("  • No tasks currently in progress")

    lines.append("")
    lines.append("🚫 Blockers:")
    if summary["blockers"]:
        for item in summary["blockers"]:
            subject = item.get("subject") or item.get("description") or ""
            lines.append(f"  • [{item['task_code']}] {subject} — {item['reason']}")
    else:
        lines.append("  • No blockers 🎉")

    return "\n".join(lines)


@router.get("/my-summary")
def get_my_standup(
    activity_date: str = Query(None, description="Date to show activities for (YYYY-MM-DD). Defaults to yesterday."),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return standup summary for the currently logged-in user's developer record."""
    target_date = datetime.strptime(activity_date, "%Y-%m-%d").date() if activity_date else None

    if not current_user.developer_id:
        # Fallback: user has no developer record — still show activities they logged via created_by_id
        yesterday = target_date or _yesterday()
        activities = (
            db.query(models.TaskActivity)
            .options(joinedload(models.TaskActivity.task))
            .filter(
                models.TaskActivity.created_by_id == current_user.id,
                models.TaskActivity.activity_date == yesterday,
            )
            .order_by(models.TaskActivity.id.desc())
            .all()
        )
        yesterday_items = []
        for a in activities:
            task = a.task
            yesterday_items.append({
                "activity_id": a.id, "task_id": a.task_id,
                "task_code": task.task_code if task else None,
                "task_description": task.description if task else None,
                "subject": task.subject if task else None,
                "notes": a.description, "hours_spent": a.hours_spent, "percentage": a.percentage,
            })
        return {"developer_id": None, "developer_name": current_user.full_name or current_user.username, "yesterday": yesterday_items, "today": [], "blockers": [], "recent_commits": []}

    summary = _build_developer_summary(current_user.developer_id, db, target_date)
    return summary


@router.get("/team-summary")
def get_team_standup(
    activity_date: str = Query(None, description="Date to show activities for (YYYY-MM-DD). Defaults to yesterday."),
    current_user: models.User = Depends(require_roles("Admin", "Manager", "Lead")),
    db: Session = Depends(get_db),
):
    """Return standup summaries for all developers in the user's projects.
    Admins see all developers. Manager/Lead see developers in their assigned projects.
    OPTIMIZED: batch queries instead of per-developer to avoid N+1 over network."""
    target_date = datetime.strptime(activity_date, "%Y-%m-%d").date() if activity_date else None
    yesterday = target_date or _yesterday()

    # 1. Get developers list
    if current_user.role == "Admin":
        developers = db.query(models.Developer).filter(models.Developer.active == True).all()
    else:
        project_ids = [p.id for p in current_user.projects]
        if not project_ids and current_user.developer_id:
            dev = current_user.developer
            if dev:
                project_ids = [p.id for p in dev.projects]
        if not project_ids:
            return []
        developers = (
            db.query(models.Developer)
            .join(models.developer_projects)
            .filter(
                models.developer_projects.c.project_id.in_(project_ids),
                models.Developer.active == True,
            )
            .distinct()
            .all()
        )

    dev_ids = [d.id for d in developers]
    if not dev_ids:
        return []

    # Build dev_id -> user_id mapping
    dev_user_map = {}
    users = db.query(models.User).filter(models.User.developer_id.in_(dev_ids)).all()
    for u in users:
        dev_user_map[u.developer_id] = u.id

    # 2. BATCH: all activities for yesterday for ALL developers at once
    activity_conditions = [models.TaskActivity.developer_id.in_(dev_ids)]
    user_ids = list(dev_user_map.values())
    if user_ids:
        activity_conditions.append(models.TaskActivity.created_by_id.in_(user_ids))
    # Also include activities on tasks assigned to these developers
    dev_task_subq = db.query(models.Task.id).filter(models.Task.developer_id.in_(dev_ids)).subquery()
    activity_conditions.append(models.TaskActivity.task_id.in_(db.query(dev_task_subq.c.id)))

    all_activities = (
        db.query(models.TaskActivity)
        .options(joinedload(models.TaskActivity.task))
        .filter(
            or_(*activity_conditions),
            models.TaskActivity.activity_date == yesterday,
        )
        .order_by(models.TaskActivity.id.desc())
        .all()
    )

    # 3. BATCH: all in-progress tasks for ALL developers
    all_in_progress = (
        db.query(models.Task)
        .filter(
            models.Task.developer_id.in_(dev_ids),
            models.Task.status.in_(["In Progress", "Inprogress"]),
        )
        .order_by(models.Task.priority.desc(), models.Task.end_date.asc())
        .all()
    )

    # 4. BATCH: all on-hold tasks for ALL developers
    all_on_hold = (
        db.query(models.Task)
        .filter(
            models.Task.developer_id.in_(dev_ids),
            models.Task.status.in_(["On Hold", "OnHold"]),
        )
        .all()
    )

    # Build task_id -> developer_id mapping for activities
    all_dev_tasks = db.query(models.Task.id, models.Task.developer_id).filter(
        models.Task.developer_id.in_(dev_ids)
    ).all()
    task_to_dev = {t.id: t.developer_id for t in all_dev_tasks}

    # Build user_id -> dev_id reverse mapping
    user_to_dev = {v: k for k, v in dev_user_map.items()}

    # Group activities by developer
    from collections import defaultdict
    activities_by_dev = defaultdict(list)
    for a in all_activities:
        # Determine which developer this activity belongs to
        assigned_dev = None
        if a.developer_id and a.developer_id in dev_ids:
            assigned_dev = a.developer_id
        elif a.task_id and a.task_id in task_to_dev:
            assigned_dev = task_to_dev[a.task_id]
        elif a.created_by_id and a.created_by_id in user_to_dev:
            assigned_dev = user_to_dev[a.created_by_id]
        if assigned_dev:
            activities_by_dev[assigned_dev].append(a)

    # Group in-progress tasks by developer
    in_progress_by_dev = defaultdict(list)
    for t in all_in_progress:
        in_progress_by_dev[t.developer_id].append(t)

    # Group on-hold tasks by developer
    on_hold_by_dev = defaultdict(list)
    for t in all_on_hold:
        on_hold_by_dev[t.developer_id].append(t)

    # 4b. BATCH: recent commits for ALL developers on the standup date
    all_commits = (
        db.query(models.Commit)
        .options(joinedload(models.Commit.repo))
        .filter(
            models.Commit.developer_id.in_(dev_ids),
            models.Commit.committed_at >= datetime.combine(yesterday, datetime.min.time()),
            models.Commit.committed_at <= datetime.combine(yesterday, datetime.max.time()),
        )
        .order_by(models.Commit.developer_id, models.Commit.committed_at.desc())
        .all()
    )
    commits_by_dev = defaultdict(list)
    for c in all_commits:
        if len(commits_by_dev[c.developer_id]) < 10:  # limit 10 per developer
            commits_by_dev[c.developer_id].append(c)

    # 5. Assemble summaries
    summaries = []
    for dev in developers:
        yesterday_items = []
        for a in activities_by_dev.get(dev.id, []):
            task = a.task
            yesterday_items.append({
                "activity_id": a.id,
                "task_id": a.task_id,
                "task_code": task.task_code if task else None,
                "task_description": task.description if task else None,
                "subject": task.subject if task else None,
                "notes": a.description,
                "hours_spent": a.hours_spent,
                "percentage": a.percentage,
            })

        today_items = []
        for t in in_progress_by_dev.get(dev.id, []):
            today_items.append({
                "task_id": t.id,
                "task_code": t.task_code,
                "description": t.description,
                "subject": t.subject,
                "priority": t.priority,
                "end_date": str(t.end_date) if t.end_date else None,
                "percentage": t.percentage,
            })

        blockers = []
        for t in on_hold_by_dev.get(dev.id, []):
            blockers.append({
                "task_id": t.id,
                "task_code": t.task_code,
                "description": t.description,
                "subject": t.subject,
                "status": t.status,
                "reason": "On Hold",
            })

        recent_commits = [
            {
                "short_hash": c.short_hash or (c.commit_hash[:7] if c.commit_hash else ""),
                "message": c.message,
                "repo_name": (c.repo.repo_name or c.repo.repo_slug) if c.repo else None,
            }
            for c in commits_by_dev.get(dev.id, [])
        ]

        summaries.append({
            "developer_id": dev.id,
            "developer_name": dev.name,
            "yesterday": yesterday_items,
            "today": today_items,
            "blockers": blockers,
            "recent_commits": recent_commits,
        })

    return summaries


@router.get("/generate-text")
def generate_standup_text(
    developer_id: int = Query(None, description="Developer ID (defaults to current user's developer)"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return a plain-text formatted standup message for copy/paste into Teams/Slack."""
    # If no developer_id provided, use the current user's developer
    if developer_id is None:
        if not current_user.developer_id:
            raise HTTPException(status_code=400, detail="Your account is not linked to a developer record.")
        developer_id = current_user.developer_id
    else:
        # Only Admin/Manager/Lead can generate text for other developers
        if developer_id != current_user.developer_id and current_user.role not in ("Admin", "Manager", "Lead"):
            raise HTTPException(status_code=403, detail="You can only generate standup text for yourself.")

    summary = _build_developer_summary(developer_id, db)
    text = _format_standup_text(summary)
    return {"text": text, "developer_name": summary["developer_name"]}
