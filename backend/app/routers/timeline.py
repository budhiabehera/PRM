from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from .. import models
from ..database import get_db

router = APIRouter(prefix="/api/timeline", tags=["Timeline"])


@router.get("/gantt")
def gantt_data(
    project_id: int | None = None,
    developer_id: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.Task).filter(models.Task.start_date.isnot(None), models.Task.end_date.isnot(None))
    if project_id:
        q = q.filter(models.Task.project_id == project_id)
    if developer_id:
        q = q.filter(models.Task.developer_id == developer_id)
    tasks = q.order_by(models.Task.start_date).all()

    return [
        {
            "id": t.id,
            "task_code": t.task_code,
            "description": t.description,
            "developer": t.developer.name if t.developer else None,
            "project": t.project.name if t.project else None,
            "sub_module": t.sub_module.name if t.sub_module else None,
            "status": t.status,
            "priority": t.priority,
            "start_date": t.start_date,
            "end_date": t.end_date,
            "percent_complete": t.percent_complete,
            "is_cross_month": t.is_cross_month,
        }
        for t in tasks
    ]


@router.get("/monthly-allocation")
def monthly_allocation(db: Session = Depends(get_db)):
    """Total allocated hours per sprint/month, split by project."""
    sprints = db.query(models.Sprint).order_by(models.Sprint.start_date).all()
    result = []
    for s in sprints:
        by_project: dict[str, float] = {}
        for t in s.tasks:
            key = t.project.name if t.project else "Unassigned"
            by_project[key] = by_project.get(key, 0) + t.estimated_hours
        result.append({"month": s.name, "by_project": by_project})
    return result
