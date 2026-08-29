from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import date
from typing import Optional

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/time-logs", tags=["Time Logs"])


def _serialize_time_log(tl):
    return {
        "id": tl.id,
        "task_id": tl.task_id,
        "developer_id": tl.developer_id,
        "date": tl.date,
        "hours": tl.hours,
        "notes": tl.notes,
        "created_at": tl.created_at,
        "task_code": tl.task.task_code if tl.task else None,
        "task_description": tl.task.description if tl.task else None,
    }


@router.get("/summary")
def time_log_summary(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get total hours per day for a date range (current user only)."""
    if not current_user.developer_id:
        return []

    query = (
        db.query(
            models.TimeLog.date,
            func.sum(models.TimeLog.hours).label("total_hours"),
        )
        .filter(models.TimeLog.developer_id == current_user.developer_id)
    )

    if date_from:
        query = query.filter(models.TimeLog.date >= date_from)
    if date_to:
        query = query.filter(models.TimeLog.date <= date_to)

    results = query.group_by(models.TimeLog.date).order_by(models.TimeLog.date).all()
    return [{"date": r.date, "total_hours": r.total_hours} for r in results]


@router.get("")
def list_time_logs(
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    task_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get time log entries filtered by current user's developer_id."""
    if not current_user.developer_id:
        return []

    query = (
        db.query(models.TimeLog).options(
            joinedload(models.TimeLog.task),
        )
        .filter(models.TimeLog.developer_id == current_user.developer_id)
    )

    if date_from:
        query = query.filter(models.TimeLog.date >= date_from)
    if date_to:
        query = query.filter(models.TimeLog.date <= date_to)
    if task_id:
        query = query.filter(models.TimeLog.task_id == task_id)

    time_logs = query.order_by(models.TimeLog.date.desc(), models.TimeLog.id.desc()).all()
    return [_serialize_time_log(tl) for tl in time_logs]


@router.post("", status_code=201)
def create_time_log(
    payload: schemas.TimeLogCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create a time log entry, auto-setting developer_id from current user."""
    if not current_user.developer_id:
        raise HTTPException(400, "Your account is not linked to a developer profile.")

    task = db.get(models.Task, payload.task_id)
    if not task:
        raise HTTPException(404, "Task not found")

    time_log = models.TimeLog(
        task_id=payload.task_id,
        developer_id=current_user.developer_id,
        date=payload.date,
        hours=payload.hours,
        notes=payload.notes,
    )
    db.add(time_log)
    db.commit()
    db.refresh(time_log)
    return _serialize_time_log(time_log)


@router.put("/{time_log_id}")
def update_time_log(
    time_log_id: int,
    payload: schemas.TimeLogUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update a time log entry (only own entries)."""
    time_log = db.get(models.TimeLog, time_log_id)
    if not time_log:
        raise HTTPException(404, "Time log not found")
    if time_log.developer_id != current_user.developer_id:
        raise HTTPException(403, "You can only edit your own time log entries.")

    if payload.date is not None:
        time_log.date = payload.date
    if payload.hours is not None:
        time_log.hours = payload.hours
    if payload.notes is not None:
        time_log.notes = payload.notes
    if payload.task_id is not None:
        task = db.get(models.Task, payload.task_id)
        if not task:
            raise HTTPException(404, "Task not found")
        time_log.task_id = payload.task_id

    db.commit()
    db.refresh(time_log)
    return _serialize_time_log(time_log)


@router.delete("/{time_log_id}", status_code=204)
def delete_time_log(
    time_log_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete a time log entry (only own entries)."""
    time_log = db.get(models.TimeLog, time_log_id)
    if not time_log:
        raise HTTPException(404, "Time log not found")
    if time_log.developer_id != current_user.developer_id:
        raise HTTPException(403, "You can only delete your own time log entries.")

    db.delete(time_log)
    db.commit()
