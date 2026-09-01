from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from .. import models
from ..database import get_db
from ..deps import get_current_user, get_user_project_ids
from ..deps import MANAGEMENT_EXCLUDED_ROLES
from ..utils.calculations import net_capacity, utilization_status

router = APIRouter(prefix="/api/utilization", tags=["Utilization"])


@router.get("/grid")
def utilization_grid(db: Session = Depends(get_db), developer_id: int | None = None,
                     current_user: models.User = Depends(get_current_user)):
    """Developer x Sprint(month) utilization grid."""
    allowed = get_user_project_ids(current_user)
    dev_q = db.query(models.Developer).options(
        joinedload(models.Developer.home_module),
        joinedload(models.Developer.tasks),
    ).filter(models.Developer.active == True).filter(models.Developer.role.notin_(MANAGEMENT_EXCLUDED_ROLES))  # noqa: E712
    if developer_id:
        dev_q = dev_q.filter(models.Developer.id == developer_id)
    # Filter developers to only those in user's projects
    if allowed is not None:
        from ..models import developer_projects
        dev_q = dev_q.filter(models.Developer.id.in_(
            db.query(developer_projects.c.developer_id).filter(developer_projects.c.project_id.in_(allowed))
        ))
    devs = dev_q.order_by(func.lower(models.Developer.name)).all()
    sprints = db.query(models.Sprint).order_by(models.Sprint.start_date).all()

    # Pre-fetch all availability records in one query (avoid N*M individual queries)
    dev_ids = [d.id for d in devs]
    sprint_ids = [s.id for s in sprints]
    all_avail = {}
    if dev_ids and sprint_ids:
        avail_rows = db.query(models.Availability).filter(
            models.Availability.developer_id.in_(dev_ids),
            models.Availability.sprint_id.in_(sprint_ids),
        ).all()
        for av in avail_rows:
            all_avail[(av.developer_id, av.sprint_id)] = av.leave_days or 0

    rows = []
    for d in devs:
        cells = []
        for s in sprints:
            leave_days = all_avail.get((d.id, s.id), 0)
            cap = net_capacity(d.base_capacity, leave_days)
            sprint_tasks = [t for t in d.tasks if t.sprint_id == s.id]
            if allowed is not None:
                sprint_tasks = [t for t in sprint_tasks if t.project_id in allowed]
            allocated = sum(t.estimated_hours for t in sprint_tasks)
            pct = round((allocated / cap) * 100) if cap else 0
            cells.append({
                "sprint_id": s.id,
                "month": s.name,
                "capacity": round(cap, 1),
                "allocated_hours": allocated,
                "utilization_pct": pct,
                "status": utilization_status(pct),
            })
        rows.append({
            "developer_id": d.id,
            "developer_name": d.name,
            "role": d.role,
            "module": d.home_module.name if d.home_module else None,
            "skill": d.skill,
            "cells": cells,
        })
    return {"sprints": [s.name for s in sprints], "rows": rows}
