"""Consolidated dropdown endpoint — returns all reference/lookup data in a single call.

Replaces 8 separate API calls (projects, modules, sub-modules, resources,
work-types, sprints, skills, task-statuses) with one lightweight query.
Only returns the fields needed for dropdowns (id, name, etc.) — no heavy
joins, no per-record stats, no task aggregation.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from .. import models
from ..database import get_db
from ..deps import get_current_user, get_user_project_ids, get_visible_developer_ids, get_management_excluded_roles

router = APIRouter(prefix="/api/dropdowns", tags=["Dropdowns"])


@router.get("")
def get_all_dropdowns(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return all dropdown/reference data in a single response.

    Lightweight: only fetches the fields needed for filter dropdowns.
    No task joins, no per-resource stats, no sprint utilization calculations.
    """
    allowed = get_user_project_ids(current_user)

    # --- Projects (filtered by user access) ---
    p_q = db.query(models.Project)
    if allowed is not None:
        p_q = p_q.filter(models.Project.id.in_(allowed))
    projects = [
        {"id": p.id, "name": p.name}
        for p in p_q.order_by(func.lower(models.Project.name)).all()
    ]

    # --- Main Modules ---
    main_modules = [
        {"id": m.id, "name": m.name, "project_id": m.project_id}
        for m in db.query(models.MainModule).order_by(func.lower(models.MainModule.name)).all()
    ]

    # --- Sub Modules ---
    sub_modules = [
        {"id": s.id, "name": s.name, "main_module_id": s.main_module_id}
        for s in db.query(models.SubModule).order_by(func.lower(models.SubModule.name)).all()
    ]

    # --- Resources (developers — lightweight, no task joins) ---
    dev_q = (
        db.query(models.Developer)
        .options(joinedload(models.Developer.projects))
        .filter(models.Developer.active == True)  # noqa: E712
        .filter(models.Developer.role.notin_(get_management_excluded_roles(db)))
    )
    if allowed is not None:
        from ..models import developer_projects
        dev_q = dev_q.filter(models.Developer.id.in_(
            db.query(developer_projects.c.developer_id).filter(developer_projects.c.project_id.in_(allowed))
        ))
    visible_dev_ids = get_visible_developer_ids(current_user, db=db)
    if visible_dev_ids is not None:
        dev_q = dev_q.filter(models.Developer.id.in_(visible_dev_ids))
    resources = [
        {"id": d.id, "name": d.name, "project_ids": [p.id for p in d.projects]}
        for d in dev_q.order_by(func.lower(func.ltrim(func.rtrim(models.Developer.name)))).all()
    ]

    # --- Work Types ---
    work_types = [
        {"id": wt.id, "name": wt.name, "customer_committed": wt.customer_committed, "color": wt.color}
        for wt in db.query(models.WorkType).order_by(func.lower(models.WorkType.name)).all()
    ]

    # --- Sprints (lightweight — no task stats) ---
    sp_q = db.query(models.Sprint).options(joinedload(models.Sprint.project))
    if allowed is not None:
        sp_q = sp_q.filter(
            (models.Sprint.project_id.in_(allowed)) | (models.Sprint.project_id.is_(None))
        )
    sprints = [
        {"id": s.id, "name": s.name, "project_id": s.project_id}
        for s in sp_q.order_by(models.Sprint.id.asc()).all()
    ]

    # --- Skills ---
    skills = [
        {"id": sk.id, "name": sk.name}
        for sk in db.query(models.Skill).order_by(models.Skill.name).all()
    ]

    # --- Task Statuses ---
    task_statuses = [
        {"id": ts.id, "name": ts.name, "color": ts.color, "sort_order": ts.sort_order}
        for ts in db.query(models.TaskStatus).order_by(models.TaskStatus.sort_order, models.TaskStatus.name).all()
    ]

    return {
        "projects": projects,
        "main_modules": main_modules,
        "sub_modules": sub_modules,
        "resources": resources,
        "work_types": work_types,
        "sprints": sprints,
        "skills": skills,
        "task_statuses": task_statuses,
    }
