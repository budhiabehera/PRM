from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import date, timedelta

from .. import models
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["My Dashboard"])


@router.get("/my-summary")
def my_summary(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """
    Personalized dashboard data for the logged-in user.
    Returns summary cards, upcoming deadlines, workload by project, and recent activity.
    """
    developer_id = current_user.developer_id
    if not developer_id:
        return {
            "summary": {"total": 0, "in_progress": 0, "completed": 0, "overdue": 0},
            "upcoming_deadlines": [],
            "workload_by_project": [],
            "recent_activity": [],
        }

    today = date.today()
    seven_days = today + timedelta(days=7)

    # All tasks assigned to this developer
    tasks = db.query(models.Task).filter(models.Task.developer_id == developer_id).all()

    # --- Summary Cards ---
    total = len(tasks)
    in_progress = sum(1 for t in tasks if t.status == "In Progress")
    completed = sum(1 for t in tasks if t.status == "Completed")
    overdue = sum(
        1 for t in tasks
        if t.end_date is not None and t.end_date < today and t.status != "Completed"
    )

    # --- Upcoming Deadlines (next 7 days) ---
    upcoming = [
        t for t in tasks
        if t.end_date is not None and today <= t.end_date <= seven_days and t.status != "Completed"
    ]
    upcoming.sort(key=lambda t: t.end_date)
    upcoming_deadlines = [
        {
            "id": t.id,
            "task_code": t.task_code,
            "description": t.description,
            "priority": t.priority,
            "end_date": t.end_date.isoformat(),
            "status": t.status,
            "project_name": t.project.name if t.project else "Unassigned",
        }
        for t in upcoming
    ]

    # --- Workload by Project (estimated_hours grouped by project) ---
    project_hours: dict[str, float] = {}
    for t in tasks:
        if t.status == "Completed":
            continue
        pname = t.project.name if t.project else "Unassigned"
        project_hours[pname] = project_hours.get(pname, 0) + t.estimated_hours
    workload_by_project = [
        {"project": name, "hours": hours}
        for name, hours in sorted(project_hours.items(), key=lambda x: -x[1])
    ]

    # --- Recent Activity (last 5 activity entries for user's tasks) ---
    task_ids = [t.id for t in tasks]
    recent_activities = (
        db.query(models.TaskActivity)
        .filter(models.TaskActivity.task_id.in_(task_ids))
        .order_by(models.TaskActivity.activity_date.desc(), models.TaskActivity.id.desc())
        .limit(5)
        .all()
    ) if task_ids else []

    recent_activity = [
        {
            "id": a.id,
            "task_id": a.task_id,
            "task_code": a.task.task_code if a.task else None,
            "description": a.description,
            "hours_spent": a.hours_spent,
            "activity_date": a.activity_date.isoformat() if a.activity_date else None,
            "developer_name": a.developer.name if a.developer else None,
        }
        for a in recent_activities
    ]

    return {
        "summary": {
            "total": total,
            "in_progress": in_progress,
            "completed": completed,
            "overdue": overdue,
        },
        "upcoming_deadlines": upcoming_deadlines,
        "workload_by_project": workload_by_project,
        "recent_activity": recent_activity,
    }
