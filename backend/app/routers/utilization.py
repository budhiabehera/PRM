from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from .. import models
from ..database import get_db
from ..utils.calculations import net_capacity, utilization_status

router = APIRouter(prefix="/api/utilization", tags=["Utilization"])


@router.get("/grid")
def utilization_grid(db: Session = Depends(get_db), developer_id: int | None = None):
    """Developer x Sprint(month) utilization grid."""
    dev_q = db.query(models.Developer).filter(models.Developer.active == True)  # noqa: E712
    if developer_id:
        dev_q = dev_q.filter(models.Developer.id == developer_id)
    devs = dev_q.all()
    sprints = db.query(models.Sprint).order_by(models.Sprint.start_date).all()

    rows = []
    for d in devs:
        cells = []
        for s in sprints:
            leave = (
                db.query(models.Availability)
                .filter(models.Availability.developer_id == d.id, models.Availability.sprint_id == s.id)
                .first()
            )
            leave_days = leave.leave_days if leave else 0
            cap = net_capacity(d.base_capacity, leave_days)
            allocated = sum(t.estimated_hours for t in d.tasks if t.sprint_id == s.id)
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
