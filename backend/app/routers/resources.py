from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload
from .. import models, schemas
from ..database import get_db
from ..deps import require_roles, get_current_user, get_user_project_ids
from ..deps import MANAGEMENT_EXCLUDED_ROLES
from ..utils.calculations import utilization_status

router = APIRouter(prefix="/api/resources", tags=["Resources"])


def _dev_with_stats(dev: models.Developer, db: Session, sprint_id: int | None = None):
    tasks = dev.tasks
    if sprint_id:
        tasks = [t for t in tasks if t.sprint_id == sprint_id]
    active_tasks = [t for t in tasks if t.status not in ("Completed",)]
    assigned_hours = sum(t.estimated_hours or 0 for t in tasks)
    pct = round((assigned_hours / dev.base_capacity) * 100) if dev.base_capacity else 0
    return {
        "id": dev.id,
        "dev_code": dev.dev_code,
        "name": dev.name,
        "role": dev.role,
        "home_module_id": dev.home_module_id,
        "project_ids": [p.id for p in dev.projects],
        "home_module": dev.home_module.name if dev.home_module else None,
        "skill": dev.skill,
        "base_capacity": dev.base_capacity,
        "active": dev.active,
        "active_tasks": len(active_tasks),
        "assigned_hours": assigned_hours,
        "utilization_pct": pct,
        "utilization_status": utilization_status(pct),
    }


@router.get("")
def list_resources(
    module_id: int | None = None,
    role: str | None = None,
    skill: str | None = None,
    sprint_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Developer).options(
        joinedload(models.Developer.home_module),
        joinedload(models.Developer.tasks),
        joinedload(models.Developer.projects),
    )
    # Filter developers by user's project access
    allowed = get_user_project_ids(current_user)
    if allowed is not None:
        from ..models import developer_projects
        q = q.filter(models.Developer.id.in_(
            db.query(developer_projects.c.developer_id).filter(developer_projects.c.project_id.in_(allowed))
        ))
    if module_id:
        q = q.filter(models.Developer.home_module_id == module_id)
    if role:
        q = q.filter(models.Developer.role == role)
    if skill:
        q = q.filter(models.Developer.skill == skill)
    # Exclude management roles (SVP-Product, AVP-Product, Product Manager)
    q = q.filter(models.Developer.active == True).filter(models.Developer.role.notin_(MANAGEMENT_EXCLUDED_ROLES))
    devs = q.order_by(func.lower(func.ltrim(func.rtrim(models.Developer.name)))).all()
    return [_dev_with_stats(d, db, sprint_id=sprint_id) for d in devs]


@router.get("/stats")
def resource_stats(db: Session = Depends(get_db),
                   current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    dev_q = db.query(models.Developer).options(
        joinedload(models.Developer.tasks),
    ).filter(models.Developer.active == True).filter(models.Developer.role.notin_(MANAGEMENT_EXCLUDED_ROLES))  # noqa: E712
    if allowed is not None:
        from ..models import developer_projects
        dev_q = dev_q.filter(models.Developer.id.in_(
            db.query(developer_projects.c.developer_id).filter(developer_projects.c.project_id.in_(allowed))
        ))
    devs = dev_q.all()
    total_capacity = sum(d.base_capacity for d in devs)
    total_assigned = sum(sum(t.estimated_hours for t in d.tasks if allowed is None or t.project_id in allowed) for d in devs)
    avg_util = round((total_assigned / total_capacity) * 100, 1) if total_capacity else 0
    return {
        "active_developers": len(devs),
        "team_capacity": total_capacity,
        "monthly_hours": total_assigned,
        "avg_utilization": avg_util,
    }


@router.get("/{dev_id}")
def get_resource(dev_id: int, db: Session = Depends(get_db)):
    dev = db.get(models.Developer, dev_id)
    if not dev:
        raise HTTPException(404, "Developer not found")
    return _dev_with_stats(dev, db)


@router.post("", status_code=201)
def create_resource(payload: schemas.DeveloperCreate, db: Session = Depends(get_db),
                     _user=Depends(require_roles("Admin", "Manager"))):
    if db.query(models.Developer).filter(models.Developer.dev_code == payload.dev_code).first():
        raise HTTPException(400, "Developer code already exists")
    data = payload.model_dump()
    project_ids = data.pop("project_ids", [])
    dev = models.Developer(**data)
    db.add(dev)
    db.commit()
    # Assign projects (many-to-many)
    if project_ids:
        projects = db.query(models.Project).filter(models.Project.id.in_(project_ids)).all()
        dev.projects = projects
        db.commit()
    db.refresh(dev)
    return _dev_with_stats(dev, db)


@router.put("/{dev_id}")
def update_resource(dev_id: int, payload: schemas.DeveloperUpdate, db: Session = Depends(get_db),
                     _user=Depends(require_roles("Admin", "Manager"))):
    dev = db.get(models.Developer, dev_id)
    if not dev:
        raise HTTPException(404, "Developer not found")
    data = payload.model_dump(exclude_unset=True)
    project_ids = data.pop("project_ids", None)
    for key, value in data.items():
        setattr(dev, key, value)
    # Update project assignments if provided
    if project_ids is not None:
        projects = db.query(models.Project).filter(models.Project.id.in_(project_ids)).all() if project_ids else []
        dev.projects = projects
    db.commit()
    db.refresh(dev)
    return _dev_with_stats(dev, db)


@router.delete("/{dev_id}", status_code=204)
def delete_resource(dev_id: int, db: Session = Depends(get_db),
                     _user=Depends(require_roles("Admin", "Manager"))):
    dev = db.get(models.Developer, dev_id)
    if not dev:
        raise HTTPException(404, "Developer not found")
    db.delete(dev)
    db.commit()
