from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..utils.calculations import utilization_status

router = APIRouter(prefix="/api/resources", tags=["Resources"])


def _dev_with_stats(dev: models.Developer, db: Session):
    active_tasks = [t for t in dev.tasks if t.status not in ("Completed",)]
    assigned_hours = sum(t.estimated_hours for t in dev.tasks)
    pct = round((assigned_hours / dev.base_capacity) * 100) if dev.base_capacity else 0
    return {
        "id": dev.id,
        "dev_code": dev.dev_code,
        "name": dev.name,
        "role": dev.role,
        "home_module_id": dev.home_module_id,
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
    db: Session = Depends(get_db),
):
    q = db.query(models.Developer)
    if module_id:
        q = q.filter(models.Developer.home_module_id == module_id)
    if role:
        q = q.filter(models.Developer.role == role)
    if skill:
        q = q.filter(models.Developer.skill == skill)
    devs = q.order_by(models.Developer.name).all()
    return [_dev_with_stats(d, db) for d in devs]


@router.get("/stats")
def resource_stats(db: Session = Depends(get_db)):
    devs = db.query(models.Developer).filter(models.Developer.active == True).all()  # noqa: E712
    total_capacity = sum(d.base_capacity for d in devs)
    total_assigned = sum(sum(t.estimated_hours for t in d.tasks) for d in devs)
    avg_util = round((total_assigned / total_capacity) * 100, 1) if total_capacity else 0
    return {
        "active_developers": len(devs),
        "team_capacity": total_capacity,
        "monthly_hours": total_assigned,
        "avg_utilization": avg_util,
    }


@router.get("/{dev_id}")
def get_resource(dev_id: int, db: Session = Depends(get_db)):
    dev = db.query(models.Developer).get(dev_id)
    if not dev:
        raise HTTPException(404, "Developer not found")
    return _dev_with_stats(dev, db)


@router.post("", response_model=schemas.Developer, status_code=201)
def create_resource(payload: schemas.DeveloperCreate, db: Session = Depends(get_db)):
    if db.query(models.Developer).filter(models.Developer.dev_code == payload.dev_code).first():
        raise HTTPException(400, "Developer code already exists")
    dev = models.Developer(**payload.model_dump())
    db.add(dev)
    db.commit()
    db.refresh(dev)
    return dev


@router.put("/{dev_id}", response_model=schemas.Developer)
def update_resource(dev_id: int, payload: schemas.DeveloperUpdate, db: Session = Depends(get_db)):
    dev = db.query(models.Developer).get(dev_id)
    if not dev:
        raise HTTPException(404, "Developer not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(dev, key, value)
    db.commit()
    db.refresh(dev)
    return dev


@router.delete("/{dev_id}", status_code=204)
def delete_resource(dev_id: int, db: Session = Depends(get_db)):
    dev = db.query(models.Developer).get(dev_id)
    if not dev:
        raise HTTPException(404, "Developer not found")
    db.delete(dev)
    db.commit()
