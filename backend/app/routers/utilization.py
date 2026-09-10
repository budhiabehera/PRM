from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from .. import models
from ..database import get_db
from ..deps import get_current_user, get_user_project_ids
from ..deps import get_management_excluded_roles
from ..deps import get_visible_developer_ids
from ..utils.calculations import net_capacity, utilization_status, get_working_days_for_sprint
from ..services.hour_allocation import get_proportional_hours_for_sprint, get_holiday_set

router = APIRouter(prefix="/api/utilization", tags=["Utilization"])


@router.get("/grid")
def utilization_grid(db: Session = Depends(get_db), developer_id: int | None = None,
                     current_user: models.User = Depends(get_current_user)):
    """Developer x Sprint(month) utilization grid."""
    allowed = get_user_project_ids(current_user)
    dev_q = db.query(models.Developer).options(
        joinedload(models.Developer.home_module),
        joinedload(models.Developer.tasks),
    ).filter(models.Developer.active == True).filter(models.Developer.role.notin_(get_management_excluded_roles(db)))  # noqa: E712
    if developer_id:
        dev_q = dev_q.filter(models.Developer.id == developer_id)
    # Filter developers to only those in user's projects
    if allowed is not None:
        from ..models import developer_projects
        dev_q = dev_q.filter(models.Developer.id.in_(
            db.query(developer_projects.c.developer_id).filter(developer_projects.c.project_id.in_(allowed))
        ))
    # Apply role-based visibility filter
    visible_ids = get_visible_developer_ids(current_user, db=db)
    if visible_ids is not None:
        dev_q = dev_q.filter(models.Developer.id.in_(visible_ids))

    devs = dev_q.order_by(func.lower(models.Developer.name)).all()

    # Filter sprints to only those linked to the user's accessible projects (or global sprints)
    sprint_q = db.query(models.Sprint)
    if allowed is not None:
        sprint_q = sprint_q.filter((models.Sprint.project_id.in_(allowed)) | (models.Sprint.project_id.is_(None)))
    sprints = sprint_q.order_by(models.Sprint.id.asc()).all()

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

    # Pre-calculate working days per sprint
    sprint_working_days = {s.id: get_working_days_for_sprint(s.start_date, s.end_date, db) for s in sprints}

    # Pre-fetch holidays covering all sprint date ranges for proportional allocation
    all_start = min((s.start_date for s in sprints), default=None)
    all_end = max((s.end_date for s in sprints), default=None)
    holidays = get_holiday_set(db, all_start, all_end) if all_start and all_end else set()

    rows = []
    for d in devs:
        cells = []
        for s in sprints:
            leave_days = all_avail.get((d.id, s.id), 0)
            cap = net_capacity(d.base_capacity, leave_days, sprint_working_days[s.id])
            # Collect tasks that either belong to this sprint OR overlap its date range (cross-month)
            sprint_tasks = [t for t in d.tasks if t.sprint_id == s.id]  # direct assignment
            # Also include cross-month tasks assigned to OTHER sprints but overlapping this one
            cross_month_from_other = [t for t in d.tasks if t.sprint_id != s.id and t.is_cross_month
                                       and t.start_date and t.end_date
                                       and t.start_date <= s.end_date and t.end_date >= s.start_date]
            if allowed is not None:
                sprint_tasks = [t for t in sprint_tasks if t.project_id in (allowed or [])]
                cross_month_from_other = [t for t in cross_month_from_other if t.project_id in (allowed or [])]
            # Proportional allocation: cross-month tasks split hours across sprints
            allocated = 0.0
            for t in sprint_tasks:
                allocated += get_proportional_hours_for_sprint(t, s, holidays)
            for t in cross_month_from_other:
                allocated += get_proportional_hours_for_sprint(t, s, holidays)
            allocated = round(allocated, 1)
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
