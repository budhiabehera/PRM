from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/task-activities", tags=["Task Activities"])


@router.get("/{task_id}")
def list_activities(task_id: int, db: Session = Depends(get_db)):
    """Get all activity entries for a task, ordered by date descending."""
    activities = (
        db.query(models.TaskActivity)
        .filter(models.TaskActivity.task_id == task_id)
        .order_by(models.TaskActivity.activity_date.desc())
        .all()
    )
    result = []
    for a in activities:
        result.append({
            "id": a.id,
            "task_id": a.task_id,
            "developer_id": a.developer_id,
            "developer_name": a.developer.name if a.developer else None,
            "activity_date": a.activity_date,
            "description": a.description,
            "hours_spent": a.hours_spent,
            "percentage": a.percentage,
            "created_at": a.created_at,
        })
    return result


@router.post("", status_code=201)
def create_activity(
    payload: schemas.TaskActivityCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Add a daily activity entry for a task."""
    task = db.query(models.Task).get(payload.task_id)
    if not task:
        raise HTTPException(404, "Task not found")

    # Auto-set developer_id from current user if not provided
    developer_id = payload.developer_id or current_user.developer_id

    activity = models.TaskActivity(
        task_id=payload.task_id,
        developer_id=developer_id,
        activity_date=payload.activity_date,
        description=payload.description,
        hours_spent=payload.hours_spent,
        percentage=payload.percentage,
    )
    db.add(activity)

    # Update task's actual_hours and percent (based on latest activity percentage)
    task.actual_hours = (task.actual_hours or 0) + payload.hours_spent
    db.commit()
    db.refresh(activity)
    return {
        "id": activity.id,
        "task_id": activity.task_id,
        "developer_id": activity.developer_id,
        "developer_name": activity.developer.name if activity.developer else None,
        "activity_date": activity.activity_date,
        "description": activity.description,
        "hours_spent": activity.hours_spent,
        "percentage": activity.percentage,
        "created_at": activity.created_at,
    }


@router.delete("/{activity_id}", status_code=204)
def delete_activity(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    activity = db.query(models.TaskActivity).get(activity_id)
    if not activity:
        raise HTTPException(404, "Activity not found")
    db.delete(activity)
    db.commit()
