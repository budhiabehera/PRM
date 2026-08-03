from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/task-statuses", tags=["Task Statuses"])


@router.get("")
def list_task_statuses(db: Session = Depends(get_db)):
    """Get all task statuses ordered by sort_order."""
    statuses = db.query(models.TaskStatus).order_by(models.TaskStatus.sort_order, models.TaskStatus.name).all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "color": s.color,
            "sort_order": s.sort_order,
            "created_at": s.created_at,
        }
        for s in statuses
    ]


@router.post("", status_code=201)
def create_task_status(
    payload: schemas.TaskStatusCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create a new task status."""
    existing = db.query(models.TaskStatus).filter(models.TaskStatus.name == payload.name).first()
    if existing:
        raise HTTPException(409, f"Status '{payload.name}' already exists.")
    status = models.TaskStatus(
        name=payload.name,
        color=payload.color or "#4f46e5",
        sort_order=payload.sort_order or 0,
    )
    db.add(status)
    db.commit()
    db.refresh(status)
    return {"id": status.id, "name": status.name, "color": status.color, "sort_order": status.sort_order, "created_at": status.created_at}


@router.put("/{status_id}")
def update_task_status(
    status_id: int,
    payload: schemas.TaskStatusCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update a task status."""
    status = db.query(models.TaskStatus).get(status_id)
    if not status:
        raise HTTPException(404, "Status not found")
    # Check duplicate name
    if payload.name != status.name:
        existing = db.query(models.TaskStatus).filter(
            models.TaskStatus.name == payload.name, models.TaskStatus.id != status_id
        ).first()
        if existing:
            raise HTTPException(409, f"Status '{payload.name}' already exists.")
    status.name = payload.name
    status.color = payload.color or "#4f46e5"
    status.sort_order = payload.sort_order or 0
    db.commit()
    db.refresh(status)
    return {"id": status.id, "name": status.name, "color": status.color, "sort_order": status.sort_order, "created_at": status.created_at}


@router.delete("/{status_id}", status_code=204)
def delete_task_status(
    status_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete a task status."""
    status = db.query(models.TaskStatus).get(status_id)
    if not status:
        raise HTTPException(404, "Status not found")
    db.delete(status)
    db.commit()
