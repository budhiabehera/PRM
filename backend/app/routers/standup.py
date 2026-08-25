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

    # --- Yesterday: task activities from yesterday (by developer_id OR created_by_id) ---
    user_id = developer.user_account.id if developer.user_account else None
    activities = (
        db.query(models.TaskActivity)
        .options(joinedload(models.TaskActivity.task))
        .filter(
            or_(
                models.TaskActivity.developer_id == developer_id,
                models.TaskActivity.created_by_id == user_id,
            ) if user_id else models.TaskActivity.developer_id == developer_id,
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

    return {
        "developer_id": developer_id,
        "developer_name": developer.name,
        "yesterday": yesterday_items,
        "today": today_items,
        "blockers": blockers,
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
        return {"developer_id": None, "developer_name": current_user.full_name or current_user.username, "yesterday": yesterday_items, "today": [], "blockers": []}

    summary = _build_developer_summary(current_user.developer_id, db, target_date)
    return summary


@router.get("/team-summary")
def get_team_standup(
    activity_date: str = Query(None, description="Date to show activities for (YYYY-MM-DD). Defaults to yesterday."),
    current_user: models.User = Depends(require_roles("Admin", "Manager", "Lead")),
    db: Session = Depends(get_db),
):
    """Return standup summaries for all developers in the user's projects.
    Admins see all developers. Manager/Lead see developers in their assigned projects."""
    target_date = datetime.strptime(activity_date, "%Y-%m-%d").date() if activity_date else None

    if current_user.role == "Admin":
        developers = db.query(models.Developer).filter(models.Developer.active == True).all()
    else:
        # Get projects the user has access to
        project_ids = [p.id for p in current_user.projects]
        if not project_ids and current_user.developer_id:
            dev = current_user.developer
            if dev:
                project_ids = [p.id for p in dev.projects]

        if not project_ids:
            return []

        # Get developers assigned to those projects
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

    summaries = []
    for dev in developers:
        summaries.append(_build_developer_summary(dev.id, db, target_date))

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
