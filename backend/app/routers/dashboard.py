from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from .. import models
from ..database import get_db
from .sprints import _sprint_with_stats

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/kpis")
def kpis(db: Session = Depends(get_db)):
    total_devs = db.query(models.Developer).filter(models.Developer.active == True).count()  # noqa: E712
    tasks = db.query(models.Task).all()
    total_hours = sum(t.estimated_hours for t in tasks)
    committed = sum(1 for t in tasks if t.customer_committed)
    cross_month = sum(1 for t in tasks if t.is_cross_month)
    return {
        "total_developers": total_devs,
        "total_tasks": len(tasks),
        "total_estimated_hours": total_hours,
        "customer_committed_tasks": committed,
        "cross_month_tasks": cross_month,
    }


@router.get("/status-breakdown")
def status_breakdown(db: Session = Depends(get_db)):
    tasks = db.query(models.Task).all()
    buckets: dict[str, dict] = {}
    for t in tasks:
        b = buckets.setdefault(t.status, {"status": t.status, "count": 0, "estimated_hours": 0})
        b["count"] += 1
        b["estimated_hours"] += t.estimated_hours
    return sorted(buckets.values(), key=lambda x: -x["count"])


@router.get("/project-breakdown")
def project_breakdown(db: Session = Depends(get_db)):
    projects = db.query(models.Project).all()
    result = []
    for p in projects:
        est = sum(t.estimated_hours for t in p.tasks)
        act = sum(t.actual_hours for t in p.tasks)
        result.append({
            "project": p.name,
            "tasks": len(p.tasks),
            "estimated_hours": est,
            "remaining_hours": max(est - act, 0),
        })
    return result


@router.get("/work-type-breakdown")
def work_type_breakdown(db: Session = Depends(get_db)):
    types = db.query(models.WorkType).all()
    result = []
    for wt in types:
        result.append({
            "work_type": wt.name,
            "customer_committed": wt.customer_committed,
            "tasks": len(wt.tasks),
            "estimated_hours": sum(t.estimated_hours for t in wt.tasks),
            "actual_hours": sum(t.actual_hours for t in wt.tasks),
        })
    return result


@router.get("/module-breakdown")
def module_breakdown(db: Session = Depends(get_db)):
    modules = db.query(models.MainModule).all()
    result = []
    for m in modules:
        dev_count = db.query(models.Developer).filter(models.Developer.home_module_id == m.id).count()
        result.append({
            "module": m.name,
            "developers": dev_count,
            "tasks": len(m.tasks),
            "estimated_hours": sum(t.estimated_hours for t in m.tasks),
        })
    return result


@router.get("/sub-module-breakdown")
def sub_module_breakdown(db: Session = Depends(get_db)):
    subs = db.query(models.SubModule).all()
    result = []
    for s in subs:
        result.append({
            "sub_module": s.name,
            "main_module": s.main_module.name if s.main_module else None,
            "tasks": len(s.tasks),
            "estimated_hours": sum(t.estimated_hours for t in s.tasks),
        })
    return result


@router.get("/monthly-utilization")
def monthly_utilization(db: Session = Depends(get_db)):
    sprints = db.query(models.Sprint).order_by(models.Sprint.start_date).all()
    result = []
    devs = db.query(models.Developer).filter(models.Developer.active == True).all()  # noqa: E712
    for s in sprints:
        stats = _sprint_with_stats(s, db)
        over = healthy = idle = 0
        for d in devs:
            assigned = sum(
                t.estimated_hours for t in d.tasks if t.sprint_id == s.id
            )
            pct = (assigned / d.base_capacity * 100) if d.base_capacity else 0
            if pct <= 0:
                idle += 1
            elif pct > 100:
                over += 1
            elif pct >= 60:
                healthy += 1
        result.append({
            "month": s.name,
            "allocated_hours": stats["allocated_hours"],
            "net_capacity": stats["net_capacity"],
            "utilization_pct": stats["utilization_pct"],
            "over_count": over,
            "healthy_count": healthy,
            "idle_count": idle,
        })
    return result
