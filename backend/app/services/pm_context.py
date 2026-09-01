"""
PM Context Builder — Zero-Cost AI Project Manager
===================================================
Consolidates ALL project data into structured context dicts that
text templates can render. Pure SQL queries, no LLM API calls.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, and_, or_, case
from sqlalchemy.orm import Session, joinedload

from .. import models

IST = timezone(timedelta(hours=5, minutes=30))

# ---------------------------------------------------------------------------
# Status helpers (task statuses are free-text strings in PRM)
# ---------------------------------------------------------------------------
_COMPLETED = {"completed"}
_IN_PROGRESS = {"inprogress", "in progress", "in-progress"}
_NOT_STARTED = {"not started", "notstarted", "new"}

def _normalise(s: str | None) -> str:
    return (s or "").strip().lower()

def _is_completed(status: str | None) -> bool:
    return _normalise(status) in _COMPLETED

def _is_in_progress(status: str | None) -> bool:
    return _normalise(status) in _IN_PROGRESS

def _is_not_started(status: str | None) -> bool:
    return _normalise(status) in _NOT_STARTED


# ═══════════════════════════════════════════════════════════════════════════
# 1. PROJECT CONTEXT
# ═══════════════════════════════════════════════════════════════════════════

def get_project_context(db: Session, project_id: int) -> dict[str, Any]:
    """Comprehensive project-level context dict."""
    project = db.get(models.Project, project_id)
    if not project:
        return {"error": f"Project {project_id} not found"}

    # -- Tasks -----------------------------------------------------------------
    tasks = (
        db.query(models.Task)
        .options(joinedload(models.Task.developer))
        .filter(models.Task.project_id == project_id)
        .all()
    )
    total = len(tasks)
    completed = sum(1 for t in tasks if _is_completed(t.status))
    in_progress = sum(1 for t in tasks if _is_in_progress(t.status))
    not_started = sum(1 for t in tasks if _is_not_started(t.status))
    today = date.today()
    overdue = sum(
        1 for t in tasks
        if t.end_date and t.end_date < today and not _is_completed(t.status)
    )
    total_est = sum(t.estimated_hours or 0 for t in tasks)
    total_act = sum(t.actual_hours or 0 for t in tasks)

    # -- Commits ---------------------------------------------------------------
    repo_ids = [
        r[0] for r in
        db.query(models.Repository.id)
        .filter(models.Repository.project_id == project_id)
        .all()
    ]
    total_commits = 0
    if repo_ids:
        total_commits = (
            db.query(func.count(models.Commit.id))
            .filter(models.Commit.repo_id.in_(repo_ids))
            .scalar() or 0
        )

    # -- Pull Requests ---------------------------------------------------------
    total_prs = merged_prs = open_prs = 0
    avg_merge_hr: float = 0.0
    if repo_ids:
        pr_stats = (
            db.query(
                func.count(models.PullRequest.id),
                func.sum(case((models.PullRequest.status == "MERGED", 1), else_=0)),
                func.sum(case((models.PullRequest.status == "OPEN", 1), else_=0)),
                func.avg(models.PullRequest.merge_duration_hr),
            )
            .filter(models.PullRequest.repo_id.in_(repo_ids))
            .first()
        )
        if pr_stats:
            total_prs = pr_stats[0] or 0
            merged_prs = int(pr_stats[1] or 0)
            open_prs = int(pr_stats[2] or 0)
            avg_merge_hr = round(float(pr_stats[3] or 0), 1)

    # -- Developers ------------------------------------------------------------
    dev_map: dict[int, dict] = {}
    for t in tasks:
        if not t.developer_id:
            continue
        d = dev_map.setdefault(t.developer_id, {
            "name": t.developer.name if t.developer else f"Dev#{t.developer_id}",
            "tasks": 0, "completed": 0, "commits": 0,
        })
        d["tasks"] += 1
        if _is_completed(t.status):
            d["completed"] += 1

    # Add commit counts per developer
    if repo_ids:
        dev_commits = (
            db.query(
                models.Commit.developer_id,
                func.count(models.Commit.id),
            )
            .filter(
                models.Commit.repo_id.in_(repo_ids),
                models.Commit.developer_id.isnot(None),
            )
            .group_by(models.Commit.developer_id)
            .all()
        )
        for dev_id, cnt in dev_commits:
            if dev_id in dev_map:
                dev_map[dev_id]["commits"] = cnt

    developers = sorted(dev_map.values(), key=lambda d: -d["tasks"])
    active_developers = len(developers)

    # -- Risks -----------------------------------------------------------------
    risks: list[str] = []
    if overdue:
        risks.append(f"{overdue} overdue task{'s' if overdue != 1 else ''}")

    # Tasks with no activity (no commits AND no time logs in last 7 days)
    task_ids = [t.id for t in tasks if _is_in_progress(t.status)]
    no_activity_count = 0
    if task_ids:
        week_ago = datetime.now(IST) - timedelta(days=7)
        active_task_ids_commits = set(
            r[0] for r in
            db.query(models.Commit.task_id)
            .filter(
                models.Commit.task_id.in_(task_ids),
                models.Commit.committed_at >= week_ago,
            )
            .distinct()
            .all()
        )
        active_task_ids_logs = set(
            r[0] for r in
            db.query(models.TimeLog.task_id)
            .filter(
                models.TimeLog.task_id.in_(task_ids),
                models.TimeLog.date >= week_ago.date(),
            )
            .distinct()
            .all()
        )
        active_task_ids = active_task_ids_commits | active_task_ids_logs
        no_activity_count = len(set(task_ids) - active_task_ids)
        if no_activity_count:
            risks.append(f"{no_activity_count} in-progress task{'s' if no_activity_count != 1 else ''} with no dev activity in 7 days")

    if open_prs > 5:
        risks.append(f"{open_prs} open PRs pending review")

    completion_pct = round(completed / total * 100, 1) if total else 0.0

    return {
        "project_name": project.name,
        "project_code": project.code,
        "total_tasks": total,
        "completed_tasks": completed,
        "in_progress_tasks": in_progress,
        "not_started_tasks": not_started,
        "completion_pct": completion_pct,
        "overdue_tasks": overdue,
        "total_estimated_hours": round(total_est, 1),
        "total_actual_hours": round(total_act, 1),
        "hours_variance": round(total_act - total_est, 1),
        "total_commits": total_commits,
        "total_prs": total_prs,
        "merged_prs": merged_prs,
        "open_prs": open_prs,
        "avg_merge_time_hr": avg_merge_hr,
        "active_developers": active_developers,
        "developers": developers,
        "risks": risks,
    }


# ═══════════════════════════════════════════════════════════════════════════
# 2. SPRINT CONTEXT
# ═══════════════════════════════════════════════════════════════════════════

def get_sprint_context(db: Session, sprint_id: int) -> dict[str, Any]:
    """Sprint-level context dict with readiness, velocity, and blockers."""
    sprint = db.get(models.Sprint, sprint_id)
    if not sprint:
        return {"error": f"Sprint {sprint_id} not found"}

    today = date.today()
    days_remaining = max((sprint.end_date - today).days, 0) if sprint.end_date else 0
    sprint_days_total = max((sprint.end_date - sprint.start_date).days, 1) if (sprint.start_date and sprint.end_date) else 1
    days_elapsed = max(sprint_days_total - days_remaining, 1)

    # -- Tasks -----------------------------------------------------------------
    tasks = (
        db.query(models.Task)
        .options(
            joinedload(models.Task.developer),
            joinedload(models.Task.project),
        )
        .filter(models.Task.sprint_id == sprint_id)
        .all()
    )
    total = len(tasks)
    completed = sum(1 for t in tasks if _is_completed(t.status))
    in_progress = sum(1 for t in tasks if _is_in_progress(t.status))
    not_started = sum(1 for t in tasks if _is_not_started(t.status))
    completion_pct = round(completed / total * 100, 1) if total else 0.0

    # -- Engineering readiness -------------------------------------------------
    task_ids = [t.id for t in tasks]
    tasks_with_commits = 0
    tasks_with_merged_pr = 0
    tasks_no_activity = 0

    if task_ids:
        committed_task_ids = set(
            r[0] for r in
            db.query(models.Commit.task_id)
            .filter(models.Commit.task_id.in_(task_ids))
            .distinct()
            .all()
        )
        tasks_with_commits = len(committed_task_ids)

        merged_task_ids = set(
            r[0] for r in
            db.query(models.PullRequest.task_id)
            .filter(
                models.PullRequest.task_id.in_(task_ids),
                models.PullRequest.status == "MERGED",
            )
            .distinct()
            .all()
        )
        tasks_with_merged_pr = len(merged_task_ids)

        tasks_no_activity = total - len(committed_task_ids | merged_task_ids)

    readiness_pct = round(tasks_with_merged_pr / total * 100, 1) if total else 0.0

    # -- Velocity (commits/day) ------------------------------------------------
    total_sprint_commits = 0
    if task_ids:
        total_sprint_commits = (
            db.query(func.count(models.Commit.id))
            .filter(models.Commit.task_id.in_(task_ids))
            .scalar() or 0
        )
    velocity = round(total_sprint_commits / days_elapsed, 1) if days_elapsed else 0.0

    # -- Hours / Capacity / Utilisation ----------------------------------------
    total_hours_logged = 0.0
    if task_ids:
        total_hours_logged = float(
            db.query(func.sum(models.TimeLog.hours))
            .filter(models.TimeLog.task_id.in_(task_ids))
            .scalar() or 0
        )
    total_hours_logged = round(total_hours_logged, 1)

    # Capacity: sum of base_capacity of developers assigned to this sprint's tasks
    dev_ids_in_sprint = list({t.developer_id for t in tasks if t.developer_id})
    capacity_hours = 0.0
    if dev_ids_in_sprint:
        capacity_hours = float(
            db.query(func.sum(models.Developer.base_capacity))
            .filter(models.Developer.id.in_(dev_ids_in_sprint))
            .scalar() or 0
        )
        # Subtract leave days
        leave_days_total = float(
            db.query(func.sum(models.Availability.leave_days))
            .filter(
                models.Availability.developer_id.in_(dev_ids_in_sprint),
                models.Availability.sprint_id == sprint_id,
            )
            .scalar() or 0
        )
        capacity_hours = max(capacity_hours - (leave_days_total * 8), 0)
    capacity_hours = round(capacity_hours, 1)
    utilization_pct = round(total_hours_logged / capacity_hours * 100, 1) if capacity_hours else 0.0

    # -- Top contributors ------------------------------------------------------
    contributor_map: dict[int, dict] = {}
    for t in tasks:
        if not t.developer_id or not t.developer:
            continue
        c = contributor_map.setdefault(t.developer_id, {
            "name": t.developer.name, "commits": 0, "prs": 0,
        })
    if task_ids:
        # Commits per dev
        dev_commits = (
            db.query(models.Commit.developer_id, func.count(models.Commit.id))
            .filter(models.Commit.task_id.in_(task_ids), models.Commit.developer_id.isnot(None))
            .group_by(models.Commit.developer_id)
            .all()
        )
        for dev_id, cnt in dev_commits:
            if dev_id in contributor_map:
                contributor_map[dev_id]["commits"] = cnt
        # PRs per dev
        dev_prs = (
            db.query(models.PullRequest.developer_id, func.count(models.PullRequest.id))
            .filter(models.PullRequest.task_id.in_(task_ids), models.PullRequest.developer_id.isnot(None))
            .group_by(models.PullRequest.developer_id)
            .all()
        )
        for dev_id, cnt in dev_prs:
            if dev_id in contributor_map:
                contributor_map[dev_id]["prs"] = cnt

    top_contributors = sorted(
        contributor_map.values(), key=lambda c: -(c["commits"] + c["prs"])
    )[:10]

    # -- Blockers (in-progress tasks with no activity for 5+ days) -------------
    blockers: list[dict] = []
    five_days_ago = datetime.now(IST) - timedelta(days=5)
    for t in tasks:
        if not _is_in_progress(t.status):
            continue
        has_recent = False
        if t.id:
            recent = (
                db.query(models.Commit.id)
                .filter(
                    models.Commit.task_id == t.id,
                    models.Commit.committed_at >= five_days_ago,
                )
                .first()
            )
            if recent:
                has_recent = True
            if not has_recent:
                recent_log = (
                    db.query(models.TimeLog.id)
                    .filter(
                        models.TimeLog.task_id == t.id,
                        models.TimeLog.date >= five_days_ago.date(),
                    )
                    .first()
                )
                if recent_log:
                    has_recent = True
        if not has_recent:
            blockers.append({
                "task_code": t.task_code,
                "subject": t.subject or t.description[:60],
                "reason": "No activity for 5+ days",
            })

    # -- Risk level ------------------------------------------------------------
    risk_level = "LOW"
    if completion_pct < 40 and days_remaining < sprint_days_total * 0.3:
        risk_level = "HIGH"
    elif completion_pct < 70 and days_remaining < sprint_days_total * 0.3:
        risk_level = "MEDIUM"
    elif len(blockers) > 3:
        risk_level = "MEDIUM"
    if len(blockers) > 5 or (completion_pct < 30 and days_remaining < 5):
        risk_level = "HIGH"

    return {
        "sprint_name": sprint.name,
        "start_date": sprint.start_date.isoformat() if sprint.start_date else "",
        "end_date": sprint.end_date.isoformat() if sprint.end_date else "",
        "days_remaining": days_remaining,
        "total_tasks": total,
        "completed": completed,
        "in_progress": in_progress,
        "not_started": not_started,
        "completion_pct": completion_pct,
        "tasks_with_commits": tasks_with_commits,
        "tasks_with_merged_pr": tasks_with_merged_pr,
        "tasks_no_activity": tasks_no_activity,
        "readiness_pct": readiness_pct,
        "velocity_commits_per_day": velocity,
        "total_hours_logged": total_hours_logged,
        "capacity_hours": capacity_hours,
        "utilization_pct": utilization_pct,
        "top_contributors": top_contributors,
        "blockers": blockers,
        "risk_level": risk_level,
    }


# ═══════════════════════════════════════════════════════════════════════════
# 3. DEVELOPER CONTEXT
# ═══════════════════════════════════════════════════════════════════════════

def get_developer_context(
    db: Session, developer_id: int, sprint_id: int | None = None,
) -> dict[str, Any]:
    """Developer-level context dict, optionally scoped to a sprint."""
    dev = db.get(models.Developer, developer_id)
    if not dev:
        return {"error": f"Developer {developer_id} not found"}

    task_q = (
        db.query(models.Task)
        .options(joinedload(models.Task.project), joinedload(models.Task.sprint))
        .filter(models.Task.developer_id == developer_id)
    )
    if sprint_id:
        task_q = task_q.filter(models.Task.sprint_id == sprint_id)
    tasks = task_q.all()

    assigned = len(tasks)
    completed_count = sum(1 for t in tasks if _is_completed(t.status))
    in_progress_count = sum(1 for t in tasks if _is_in_progress(t.status))

    # -- Commits ---------------------------------------------------------------
    commit_q = db.query(func.count(models.Commit.id)).filter(
        models.Commit.developer_id == developer_id,
    )
    total_commits = commit_q.scalar() or 0

    # -- PRs -------------------------------------------------------------------
    pr_q = db.query(func.count(models.PullRequest.id)).filter(
        models.PullRequest.developer_id == developer_id,
    )
    total_prs = pr_q.scalar() or 0

    # -- Reviews given ---------------------------------------------------------
    reviews_given = (
        db.query(func.count(models.PRReviewer.id))
        .filter(models.PRReviewer.developer_id == developer_id)
        .scalar() or 0
    )
    avg_review_hr = (
        db.query(func.avg(models.PRReviewer.review_duration_hr))
        .filter(
            models.PRReviewer.developer_id == developer_id,
            models.PRReviewer.review_duration_hr.isnot(None),
        )
        .scalar()
    )
    avg_review_hr = round(float(avg_review_hr or 0), 1)

    # -- Hours logged ----------------------------------------------------------
    hours_q = db.query(func.sum(models.TimeLog.hours)).filter(
        models.TimeLog.developer_id == developer_id,
    )
    if sprint_id:
        task_ids_in_sprint = [t.id for t in tasks]
        if task_ids_in_sprint:
            hours_q = hours_q.filter(models.TimeLog.task_id.in_(task_ids_in_sprint))
        else:
            hours_q = hours_q.filter(False)  # no tasks → 0 hours
    hours_logged = round(float(hours_q.scalar() or 0), 1)

    # -- Today's tasks ---------------------------------------------------------
    today = date.today()
    today_tasks = [
        {
            "task_code": t.task_code,
            "status": t.status,
            "subject": t.subject or t.description[:80],
            "percentage": t.percentage or 0,
        }
        for t in tasks
        if _is_in_progress(t.status)
        or (t.start_date and t.start_date <= today and (not t.end_date or t.end_date >= today) and not _is_completed(t.status))
    ]

    # -- Pending reviews -------------------------------------------------------
    pending_reviews_rows = (
        db.query(models.PRReviewer)
        .options(joinedload(models.PRReviewer.pull_request))
        .filter(
            models.PRReviewer.developer_id == developer_id,
            models.PRReviewer.status == "PENDING",
        )
        .all()
    )
    now_utc = datetime.now(timezone.utc)
    pending_reviews = []
    for rev in pending_reviews_rows:
        pr = rev.pull_request
        if pr:
            waiting_hr = 0.0
            if pr.created_at_bb:
                waiting_hr = round((now_utc - pr.created_at_bb.replace(tzinfo=timezone.utc)).total_seconds() / 3600, 1)
            pending_reviews.append({
                "pr_number": pr.pr_number,
                "title": pr.title,
                "hours_waiting": waiting_hr,
            })
    pending_reviews.sort(key=lambda r: -r["hours_waiting"])

    # -- Focus recommendations -------------------------------------------------
    focus: list[str] = []
    for rev in pending_reviews[:3]:
        days_w = round(rev["hours_waiting"] / 24, 1)
        focus.append(f"Review PR #{rev['pr_number']} '{rev['title']}' — waiting {days_w} days")

    # In-progress closest to deadline
    ip_tasks = [t for t in tasks if _is_in_progress(t.status)]
    ip_tasks.sort(key=lambda t: t.end_date or date.max)
    for t in ip_tasks[:3]:
        pct = t.percentage or 0
        deadline_str = f", due {t.end_date.isoformat()}" if t.end_date else ""
        focus.append(f"Complete {t.task_code} '{t.subject or t.description[:40]}' — {pct}% done{deadline_str}")

    # Almost-done tasks
    almost_done = [t for t in tasks if _is_in_progress(t.status) and (t.percentage or 0) >= 70]
    almost_done.sort(key=lambda t: -(t.percentage or 0))
    for t in almost_done[:2]:
        if f"Complete {t.task_code}" not in " ".join(focus):
            focus.append(f"Finish {t.task_code} — {t.percentage}% complete, almost done!")

    # Not started in current sprint
    ns_tasks = [t for t in tasks if _is_not_started(t.status)]
    for t in ns_tasks[:2]:
        focus.append(f"Start {t.task_code} '{t.subject or t.description[:40]}' — not yet started")

    return {
        "developer_name": dev.name,
        "developer_code": dev.dev_code,
        "assigned_tasks": assigned,
        "completed_tasks": completed_count,
        "in_progress_tasks": in_progress_count,
        "total_commits": total_commits,
        "total_prs": total_prs,
        "reviews_given": reviews_given,
        "avg_review_time_hr": avg_review_hr,
        "hours_logged": hours_logged,
        "today_tasks": today_tasks,
        "pending_reviews": pending_reviews,
        "focus_recommendations": focus,
    }


# ═══════════════════════════════════════════════════════════════════════════
# 4. DAILY BRIEF
# ═══════════════════════════════════════════════════════════════════════════

def get_daily_brief(db: Session, developer_id: int) -> dict[str, Any]:
    """'What should I focus on today?' — prioritised daily brief."""
    dev = db.get(models.Developer, developer_id)
    if not dev:
        return {"error": f"Developer {developer_id} not found"}

    today = date.today()
    yesterday = today - timedelta(days=1)
    now = datetime.now(IST)
    first_name = dev.name.split()[0] if dev.name else "there"

    # Greeting based on time of day
    hour = now.hour
    if hour < 12:
        greeting = f"Good morning, {first_name}!"
    elif hour < 17:
        greeting = f"Good afternoon, {first_name}!"
    else:
        greeting = f"Good evening, {first_name}!"

    # -- Current tasks ---------------------------------------------------------
    tasks = (
        db.query(models.Task)
        .options(joinedload(models.Task.sprint))
        .filter(models.Task.developer_id == developer_id)
        .all()
    )
    ip_tasks = [t for t in tasks if _is_in_progress(t.status)]
    ns_tasks = [t for t in tasks if _is_not_started(t.status)]
    overdue = [
        t for t in tasks
        if t.end_date and t.end_date < today and not _is_completed(t.status)
    ]

    # -- Pending reviews -------------------------------------------------------
    pending_reviews = (
        db.query(models.PRReviewer)
        .options(joinedload(models.PRReviewer.pull_request))
        .filter(
            models.PRReviewer.developer_id == developer_id,
            models.PRReviewer.status == "PENDING",
        )
        .all()
    )

    now_utc = datetime.now(timezone.utc)
    summary_parts = []
    if ip_tasks:
        summary_parts.append(f"{len(ip_tasks)} task{'s' if len(ip_tasks) != 1 else ''} in progress")
    if pending_reviews:
        summary_parts.append(f"{len(pending_reviews)} PR{'s' if len(pending_reviews) != 1 else ''} awaiting your review")
    if overdue:
        summary_parts.append(f"{len(overdue)} overdue task{'s' if len(overdue) != 1 else ''}")
    summary = "You have " + ", ".join(summary_parts) + "." if summary_parts else "All clear — no urgent items today!"

    # -- Build prioritised focus items -----------------------------------------
    focus_items: list[dict] = []
    priority = 1

    # Priority 1: Pending reviews (oldest first)
    review_items = []
    for rev in pending_reviews:
        pr = rev.pull_request
        if pr:
            waiting_hr = 0.0
            if pr.created_at_bb:
                waiting_hr = (now_utc - pr.created_at_bb.replace(tzinfo=timezone.utc)).total_seconds() / 3600
            review_items.append((waiting_hr, pr))
    review_items.sort(key=lambda x: -x[0])  # oldest first (highest hours)
    for waiting_hr, pr in review_items:
        days_w = round(waiting_hr / 24, 1)
        focus_items.append({
            "priority": priority,
            "type": "review",
            "text": f"Review PR #{pr.pr_number} '{pr.title}' — waiting {days_w} day{'s' if days_w != 1 else ''}",
        })
        priority += 1

    # Priority 2: In-progress tasks closest to deadline
    ip_sorted = sorted(ip_tasks, key=lambda t: t.end_date or date.max)
    for t in ip_sorted:
        pct = t.percentage or 0
        parts = [f"{t.task_code} '{t.subject or t.description[:50]}'", f"{pct}% complete"]
        if t.end_date:
            days_left = (t.end_date - today).days
            if days_left < 0:
                parts.append(f"overdue by {abs(days_left)} day{'s' if abs(days_left) != 1 else ''}")
            elif days_left == 0:
                parts.append("due today")
            elif days_left == 1:
                parts.append("due tomorrow")
            else:
                parts.append(f"due in {days_left} days")
        focus_items.append({
            "priority": priority,
            "type": "task",
            "text": " — ".join(parts),
        })
        priority += 1

    # Priority 3: Not-started tasks in current sprint
    # Find the current/active sprint
    active_sprint_ids = set(
        r[0] for r in
        db.query(models.Sprint.id)
        .filter(
            models.Sprint.start_date <= today,
            models.Sprint.end_date >= today,
        )
        .all()
    )
    ns_in_sprint = [t for t in ns_tasks if t.sprint_id and t.sprint_id in active_sprint_ids]
    ns_in_sprint.sort(key=lambda t: t.end_date or date.max)
    for t in ns_in_sprint:
        sprint_name = t.sprint.name if t.sprint else ""
        end_info = ""
        if t.sprint and t.sprint.end_date:
            days_left = (t.sprint.end_date - today).days
            end_info = f", sprint ends in {days_left} day{'s' if days_left != 1 else ''}"
        focus_items.append({
            "priority": priority,
            "type": "task",
            "text": f"{t.task_code} '{t.subject or t.description[:50]}' — not started{end_info}",
        })
        priority += 1

    # -- Yesterday's activity --------------------------------------------------
    yesterday_start = datetime.combine(yesterday, datetime.min.time())
    yesterday_end = datetime.combine(yesterday, datetime.max.time())

    yesterday_commits = (
        db.query(func.count(models.Commit.id))
        .filter(
            models.Commit.developer_id == developer_id,
            models.Commit.committed_at >= yesterday_start,
            models.Commit.committed_at <= yesterday_end,
        )
        .scalar() or 0
    )
    yesterday_prs_opened = (
        db.query(func.count(models.PullRequest.id))
        .filter(
            models.PullRequest.developer_id == developer_id,
            models.PullRequest.created_at_bb >= yesterday_start,
            models.PullRequest.created_at_bb <= yesterday_end,
        )
        .scalar() or 0
    )
    yesterday_prs_merged = (
        db.query(func.count(models.PullRequest.id))
        .filter(
            models.PullRequest.developer_id == developer_id,
            models.PullRequest.status == "MERGED",
            models.PullRequest.merged_at >= yesterday_start,
            models.PullRequest.merged_at <= yesterday_end,
        )
        .scalar() or 0
    )
    yesterday_hours = float(
        db.query(func.sum(models.TimeLog.hours))
        .filter(
            models.TimeLog.developer_id == developer_id,
            models.TimeLog.date == yesterday,
        )
        .scalar() or 0
    )

    # -- Alerts ----------------------------------------------------------------
    alerts: list[str] = []
    for t in overdue:
        days_over = (today - t.end_date).days
        alerts.append(f"{t.task_code} is overdue by {days_over} day{'s' if days_over != 1 else ''}")

    return {
        "developer_name": dev.name,
        "date": today.isoformat(),
        "greeting": greeting,
        "summary": summary,
        "focus_items": focus_items,
        "yesterday_activity": {
            "commits": yesterday_commits,
            "prs_opened": yesterday_prs_opened,
            "prs_merged": yesterday_prs_merged,
            "hours_logged": round(yesterday_hours, 1),
        },
        "alerts": alerts,
    }


# ═══════════════════════════════════════════════════════════════════════════
# 5. HELPERS — entity lookup by name (for chat matching)
# ═══════════════════════════════════════════════════════════════════════════

def find_project_by_name(db: Session, name: str) -> models.Project | None:
    """Case-insensitive project lookup by name or code."""
    return (
        db.query(models.Project)
        .filter(
            or_(
                func.lower(models.Project.name) == name.lower(),
                func.lower(models.Project.code) == name.lower(),
            )
        )
        .first()
    )


def find_sprint_by_name(db: Session, name: str) -> models.Sprint | None:
    """Case-insensitive sprint lookup by name."""
    return (
        db.query(models.Sprint)
        .filter(func.lower(models.Sprint.name) == name.lower())
        .first()
    )


def find_developer_by_name(db: Session, name: str) -> models.Developer | None:
    """Fuzzy developer lookup — matches if the query is contained in the name."""
    return (
        db.query(models.Developer)
        .filter(func.lower(models.Developer.name).contains(name.lower()))
        .first()
    )


def get_current_sprint(db: Session) -> models.Sprint | None:
    """Return the sprint whose date range contains today."""
    today = date.today()
    return (
        db.query(models.Sprint)
        .filter(
            models.Sprint.start_date <= today,
            models.Sprint.end_date >= today,
        )
        .first()
    )


def get_idle_developers(db: Session, project_id: int | None = None, days: int = 7) -> list[dict]:
    """Find developers with no commits or time logs in the last N days."""
    cutoff = datetime.now(IST) - timedelta(days=days)
    cutoff_date = cutoff.date()

    dev_q = db.query(models.Developer).filter(models.Developer.active == True)  # noqa: E712
    if project_id:
        dev_q = dev_q.filter(
            models.Developer.id.in_(
                db.query(models.developer_projects.c.developer_id)
                .filter(models.developer_projects.c.project_id == project_id)
            )
        )
    devs = dev_q.all()

    # Batch: get all devs with recent commits
    active_devs_commits = set(
        r[0] for r in
        db.query(models.Commit.developer_id)
        .filter(
            models.Commit.developer_id.isnot(None),
            models.Commit.committed_at >= cutoff,
        )
        .distinct()
        .all()
    )
    active_devs_logs = set(
        r[0] for r in
        db.query(models.TimeLog.developer_id)
        .filter(models.TimeLog.date >= cutoff_date)
        .distinct()
        .all()
    )
    active_devs = active_devs_commits | active_devs_logs

    idle = []
    for d in devs:
        if d.id not in active_devs:
            idle.append({"name": d.name, "dev_code": d.dev_code, "days_idle": days})
    return idle


def get_pr_status_summary(db: Session, project_id: int | None = None) -> dict[str, Any]:
    """PR overview for a project or across all projects."""
    q = db.query(models.PullRequest).options(
        joinedload(models.PullRequest.developer),
        joinedload(models.PullRequest.reviewers),
    )
    if project_id:
        repo_ids = [
            r[0] for r in
            db.query(models.Repository.id)
            .filter(models.Repository.project_id == project_id)
            .all()
        ]
        if repo_ids:
            q = q.filter(models.PullRequest.repo_id.in_(repo_ids))
        else:
            q = q.filter(False)

    prs = q.all()
    open_prs = [p for p in prs if p.status == "OPEN"]
    merged_prs = [p for p in prs if p.status == "MERGED"]

    # Stale PRs (open > 48h)
    now_utc = datetime.now(timezone.utc)
    stale = []
    for p in open_prs:
        if p.created_at_bb:
            age_hr = (now_utc - p.created_at_bb.replace(tzinfo=timezone.utc)).total_seconds() / 3600
            if age_hr > 48:
                stale.append({
                    "pr_number": p.pr_number,
                    "title": p.title,
                    "author": p.author_name,
                    "hours_open": round(age_hr, 1),
                })

    return {
        "total_prs": len(prs),
        "open": len(open_prs),
        "merged": len(merged_prs),
        "declined": sum(1 for p in prs if p.status == "DECLINED"),
        "stale_prs": stale,
        "open_prs": [
            {
                "pr_number": p.pr_number,
                "title": p.title,
                "author": p.author_name,
                "status": p.status,
            }
            for p in open_prs[:10]
        ],
    }
