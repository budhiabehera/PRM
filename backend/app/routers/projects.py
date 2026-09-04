from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from .. import models, schemas
from ..database import get_db
from ..deps import require_roles, get_current_user, get_user_project_ids

router = APIRouter(prefix="/api/projects", tags=["Projects"])


@router.get("", response_model=list[schemas.Project])
def list_projects(db: Session = Depends(get_db),
                  current_user: models.User = Depends(get_current_user)):
    q = db.query(models.Project)
    allowed = get_user_project_ids(current_user)
    if allowed is not None:
        q = q.filter(models.Project.id.in_(allowed))
    return q.order_by(func.lower(models.Project.name)).all()


@router.get("/all", response_model=list[schemas.Project])
def list_all_projects(db: Session = Depends(get_db),
                      _user=Depends(require_roles("Admin", "Manager", "Development Manager"))):
    """Return ALL projects (no user filter). For admin config pages like Modules."""
    return db.query(models.Project).order_by(func.lower(models.Project.name)).all()


@router.get("/stats")
def project_stats(db: Session = Depends(get_db)):
    total = db.query(models.Project).count()
    active = db.query(models.Project).filter(models.Project.status == "Active").count()
    total_tasks = db.query(models.Task).count()
    total_hours = db.query(func.coalesce(func.sum(models.Task.estimated_hours), 0)).scalar()
    return {
        "total_projects": total,
        "active_projects": active,
        "total_tasks": total_tasks,
        "total_hours": total_hours,
    }


@router.get("/{project_id}", response_model=schemas.Project)
def get_project(project_id: int, db: Session = Depends(get_db)):
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project


@router.post("", response_model=schemas.Project, status_code=201)
def create_project(payload: schemas.ProjectCreate, db: Session = Depends(get_db),
                    _user=Depends(require_roles("Admin", "Manager"))):
    if db.query(models.Project).filter(models.Project.code == payload.code).first():
        raise HTTPException(400, "Project code already exists")
    project = models.Project(**payload.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.put("/{project_id}", response_model=schemas.Project)
def update_project(project_id: int, payload: schemas.ProjectUpdate, db: Session = Depends(get_db),
                    _user=Depends(require_roles("Admin", "Manager"))):
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(project, key, value)
    db.commit()
    db.refresh(project)
    return project


@router.delete("/{project_id}", status_code=204)
def delete_project(project_id: int, db: Session = Depends(get_db),
                    _user=Depends(require_roles("Admin", "Manager"))):
    project = db.get(models.Project, project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    db.delete(project)
    db.commit()
