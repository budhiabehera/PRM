from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from .. import models
from ..database import get_db
from ..deps import get_current_user, get_user_project_ids
from .sprints import _sprint_with_stats

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


def _filter_tasks(db: Session, developer_id: int | None = None, sprint_id: int | None = None,
                  project_ids: list[int] | None = None, project_id: int | None = None):
    """Base task query filtered by optional developer, sprint, and project access."""
    q = db.query(models.Task)
    if project_ids is not None:
        q = q.filter(models.Task.project_id.in_(project_ids))
    if project_id:
        q = q.filter(models.Task.project_id == project_id)
    if developer_id:
        q = q.filter(models.Task.developer_id == developer_id)
    if sprint_id:
        q = q.filter(models.Task.sprint_id == sprint_id)
    return q.all()


@router.get("/kpis")
def kpis(db: Session = Depends(get_db), developer_id: int | None = None, sprint_id: int | None = None, project_id: int | None = None,
         current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    total_devs = db.query(models.Developer).filter(models.Developer.active == True).count()
    tasks = _filter_tasks(db, developer_id, sprint_id, allowed, project_id)
    total_hours = sum(t.estimated_hours for t in tasks)
    committed = sum(1 for t in tasks if t.customer_committed)
    cross_month = sum(1 for t in tasks if t.is_cross_month)
    return {
        "total_developers": total_devs if not developer_id else 1,
        "total_tasks": len(tasks),
        "total_estimated_hours": total_hours,
        "customer_committed_tasks": committed,
        "cross_month_tasks": cross_month,
    }


@router.get("/status-breakdown")
def status_breakdown(db: Session = Depends(get_db), developer_id: int | None = None, sprint_id: int | None = None, project_id: int | None = None,
                     current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    tasks = _filter_tasks(db, developer_id, sprint_id, allowed, project_id)
    buckets: dict[str, dict] = {}
    for t in tasks:
        b = buckets.setdefault(t.status, {"status": t.status, "count": 0, "estimated_hours": 0})
        b["count"] += 1
        b["estimated_hours"] += t.estimated_hours
    return sorted(buckets.values(), key=lambda x: -x["count"])


@router.get("/project-breakdown")
def project_breakdown(db: Session = Depends(get_db), developer_id: int | None = None, sprint_id: int | None = None, project_id: int | None = None,
                      current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    tasks = _filter_tasks(db, developer_id, sprint_id, allowed, project_id)
    buckets: dict[str, dict] = {}
    for t in tasks:
        pname = t.project.name if t.project else "Unassigned"
        b = buckets.setdefault(pname, {"project": pname, "tasks": 0, "estimated_hours": 0, "remaining_hours": 0})
        b["tasks"] += 1
        b["estimated_hours"] += t.estimated_hours
        b["remaining_hours"] += max(t.estimated_hours - t.actual_hours, 0)
    return list(buckets.values())


@router.get("/work-type-breakdown")
def work_type_breakdown(db: Session = Depends(get_db), developer_id: int | None = None, sprint_id: int | None = None, project_id: int | None = None,
                        current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    tasks = _filter_tasks(db, developer_id, sprint_id, allowed, project_id)
    buckets: dict[str, dict] = {}
    for t in tasks:
        wt = t.work_type
        if not wt:
            continue
        b = buckets.setdefault(wt.name, {
            "work_type": wt.name,
            "customer_committed": wt.customer_committed,
            "tasks": 0, "estimated_hours": 0, "actual_hours": 0,
        })
        b["tasks"] += 1
        b["estimated_hours"] += t.estimated_hours
        b["actual_hours"] += t.actual_hours
    return list(buckets.values())


@router.get("/module-breakdown")
def module_breakdown(db: Session = Depends(get_db), developer_id: int | None = None, sprint_id: int | None = None, project_id: int | None = None,
                     current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    tasks = _filter_tasks(db, developer_id, sprint_id, allowed, project_id)
    buckets: dict[str, dict] = {}
    for t in tasks:
        mname = t.main_module.name if t.main_module else "Unassigned"
        b = buckets.setdefault(mname, {"module": mname, "developers": 0, "tasks": 0, "estimated_hours": 0})
        b["tasks"] += 1
        b["estimated_hours"] += t.estimated_hours
    # Fill developer counts
    for key in buckets:
        mod = db.query(models.MainModule).filter(models.MainModule.name == key).first()
        if mod:
            buckets[key]["developers"] = db.query(models.Developer).filter(models.Developer.home_module_id == mod.id).count()
    return list(buckets.values())


@router.get("/sub-module-breakdown")
def sub_module_breakdown(db: Session = Depends(get_db), developer_id: int | None = None, sprint_id: int | None = None, project_id: int | None = None,
                         current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    tasks = _filter_tasks(db, developer_id, sprint_id, allowed, project_id)
    buckets: dict[str, dict] = {}
    for t in tasks:
        sname = t.sub_module.name if t.sub_module else "Unassigned"
        mname = t.main_module.name if t.main_module else None
        b = buckets.setdefault(sname, {"sub_module": sname, "main_module": mname, "tasks": 0, "estimated_hours": 0})
        b["tasks"] += 1
        b["estimated_hours"] += t.estimated_hours
    return list(buckets.values())


@router.get("/monthly-utilization")
def monthly_utilization(db: Session = Depends(get_db), developer_id: int | None = None, sprint_id: int | None = None, project_id: int | None = None,
                        current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    sprint_q = db.query(models.Sprint).order_by(models.Sprint.start_date)
    if sprint_id:
        sprint_q = sprint_q.filter(models.Sprint.id == sprint_id)
    sprints = sprint_q.all()
    result = []
    dev_q = db.query(models.Developer).filter(models.Developer.active == True)  # noqa: E712
    if developer_id:
        dev_q = dev_q.filter(models.Developer.id == developer_id)
    # Filter developers to user's projects
    if allowed is not None:
        from ..models import developer_projects
        dev_q = dev_q.filter(models.Developer.id.in_(
            db.query(developer_projects.c.developer_id).filter(developer_projects.c.project_id.in_(allowed))
        ))
    devs = dev_q.all()
    for s in sprints:
        stats = _sprint_with_stats(s, db)
        over = healthy = idle = 0
        total_allocated = 0
        total_capacity = 0
        for d in devs:
            task_filter = [t for t in d.tasks if t.sprint_id == s.id]
            # Apply project access filter
            if allowed is not None:
                task_filter = [t for t in task_filter if t.project_id in allowed]
            if project_id:
                task_filter = [t for t in task_filter if t.project_id == project_id]
            assigned = sum(t.estimated_hours for t in task_filter)
            total_allocated += assigned
            total_capacity += d.base_capacity
            pct = (assigned / d.base_capacity * 100) if d.base_capacity else 0
            if pct <= 0:
                idle += 1
            elif pct > 100:
                over += 1
            elif pct >= 60:
                healthy += 1
        util_pct = round((total_allocated / total_capacity * 100) if total_capacity else 0)
        result.append({
            "month": s.name,
            "allocated_hours": total_allocated if developer_id else stats["allocated_hours"],
            "net_capacity": total_capacity if developer_id else stats["net_capacity"],
            "utilization_pct": util_pct if developer_id else stats["utilization_pct"],
            "over_count": over,
            "healthy_count": healthy,
            "idle_count": idle,
        })
    return result
