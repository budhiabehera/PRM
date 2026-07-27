from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db

router = APIRouter(prefix="/api/work-types", tags=["Work Types"])


@router.get("")
def list_work_types(db: Session = Depends(get_db)):
    types = db.query(models.WorkType).order_by(models.WorkType.name).all()
    result = []
    for wt in types:
        tasks = wt.tasks
        est = sum(t.estimated_hours for t in tasks)
        act = sum(t.actual_hours for t in tasks)
        result.append({
            "id": wt.id,
            "name": wt.name,
            "customer_committed": wt.customer_committed,
            "color": wt.color,
            "tasks": len(tasks),
            "estimated_hours": est,
            "actual_hours": act,
            "completion_pct": round((act / est) * 100) if est else 0,
        })
    return result


@router.post("", response_model=schemas.WorkType, status_code=201)
def create_work_type(payload: schemas.WorkTypeCreate, db: Session = Depends(get_db)):
    if db.query(models.WorkType).filter(models.WorkType.name == payload.name).first():
        raise HTTPException(400, "Work type already exists")
    wt = models.WorkType(**payload.model_dump())
    db.add(wt)
    db.commit()
    db.refresh(wt)
    return wt


@router.put("/{wt_id}", response_model=schemas.WorkType)
def update_work_type(wt_id: int, payload: schemas.WorkTypeCreate, db: Session = Depends(get_db)):
    wt = db.query(models.WorkType).get(wt_id)
    if not wt:
        raise HTTPException(404, "Work type not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(wt, key, value)
    db.commit()
    db.refresh(wt)
    return wt


@router.delete("/{wt_id}", status_code=204)
def delete_work_type(wt_id: int, db: Session = Depends(get_db)):
    wt = db.query(models.WorkType).get(wt_id)
    if not wt:
        raise HTTPException(404, "Work type not found")
    db.delete(wt)
    db.commit()
