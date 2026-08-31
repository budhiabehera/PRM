from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import datetime, timezone, timedelta
from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user
from ..services.audit_service import log_audit

router = APIRouter(prefix="/api/task-activities", tags=["Task Activities"])


IST = timezone(timedelta(hours=5, minutes=30))

def _now_ist():
    return datetime.now(IST)



def _recalculate_task_stats(task, db):
    """Recalculate task actual_hours (sum of all activities) and percentage (latest activity)."""
    total_hours = (
        db.query(func.coalesce(func.sum(models.TaskActivity.hours_spent), 0))
        .filter(models.TaskActivity.task_id == task.id)
        .scalar()
    )
    task.actual_hours = total_hours

    latest = (
        db.query(models.TaskActivity)
        .filter(models.TaskActivity.task_id == task.id, models.TaskActivity.percentage > 0)
        .order_by(models.TaskActivity.activity_date.desc(), models.TaskActivity.id.desc())
        .first()
    )
    if latest:
        task.percentage = latest.percentage


def _serialize_activity(a):
    return {
        "id": a.id,
        "task_id": a.task_id,
        "developer_id": a.developer_id,
        "developer_name": a.developer.name if a.developer else None,
        "activity_date": a.activity_date,
        "description": a.description,
        "hours_spent": a.hours_spent,
        "percentage": a.percentage,
        "created_at": a.created_at,
        "created_by_id": a.created_by_id,
        "created_by_name": a.created_by.full_name if a.created_by else None,
    }


@router.get("/{task_id}")
def list_activities(task_id: int, db: Session = Depends(get_db)):
    """Get all activity entries for a task, ordered by date descending."""
    activities = (
        db.query(models.TaskActivity).options(
            joinedload(models.TaskActivity.developer),
            joinedload(models.TaskActivity.created_by),
        )
        .filter(models.TaskActivity.task_id == task_id)
        .order_by(models.TaskActivity.activity_date.desc(), models.TaskActivity.id.desc())
        .all()
    )
    return [_serialize_activity(a) for a in activities]


@router.post("", status_code=201)
def create_activity(
    payload: schemas.TaskActivityCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Add a daily activity entry for a task."""
    task = db.get(models.Task, payload.task_id)
    if not task:
        raise HTTPException(404, "Task not found")

    developer_id = payload.developer_id or current_user.developer_id

    activity = models.TaskActivity(
        task_id=payload.task_id,
        developer_id=developer_id,
        activity_date=payload.activity_date,
        description=payload.description,
        hours_spent=payload.hours_spent,
        percentage=payload.percentage,
        created_by_id=current_user.id,
        created_at=_now_ist(),
    )
    db.add(activity)
    db.flush()

    _recalculate_task_stats(task, db)

    db.commit()
    db.refresh(activity)

    # Audit log — record as a task update (activity added)
    log_audit(
        db, current_user, "UPDATE", "Task", task.id, task.task_code,
        changes={
            "activity_added": {
                "old": None,
                "new": f"{payload.activity_date} — {payload.hours_spent}h — {(payload.description or '')[:100]}"
            }
        },
    )

    return _serialize_activity(activity)


@router.put("/{activity_id}")
def update_activity(
    activity_id: int,
    payload: schemas.TaskActivityUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update an existing activity entry."""
    activity = db.get(models.TaskActivity, activity_id)
    if not activity:
        raise HTTPException(404, "Activity not found")

    task = db.get(models.Task, activity.task_id)

    # Track old values for audit
    old_desc = activity.description or ""
    old_hours = activity.hours_spent or 0
    old_pct = activity.percentage or 0
    old_date = str(activity.activity_date) if activity.activity_date else ""

    if payload.activity_date is not None:
        activity.activity_date = payload.activity_date
    if payload.description is not None:
        activity.description = payload.description
    if payload.hours_spent is not None:
        activity.hours_spent = payload.hours_spent
    if payload.percentage is not None:
        activity.percentage = payload.percentage

    db.flush()

    if task:
        _recalculate_task_stats(task, db)

    db.commit()
    db.refresh(activity)

    # Audit log — record activity update
    if task:
        changed = {}
        if payload.description is not None and payload.description != old_desc:
            changed["activity_description"] = {"old": old_desc[:100], "new": (payload.description or "")[:100]}
        if payload.hours_spent is not None and payload.hours_spent != old_hours:
            changed["activity_hours"] = {"old": str(old_hours), "new": str(payload.hours_spent)}
        if payload.percentage is not None and payload.percentage != old_pct:
            changed["activity_percentage"] = {"old": str(old_pct), "new": str(payload.percentage)}
        if payload.activity_date is not None and str(payload.activity_date) != old_date:
            changed["activity_date"] = {"old": old_date, "new": str(payload.activity_date)}
        if changed:
            log_audit(
                db, current_user, "UPDATE", "Task", task.id, task.task_code,
                changes=changed,
            )

    return _serialize_activity(activity)


@router.delete("/{activity_id}", status_code=204)
def delete_activity(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    activity = db.get(models.TaskActivity, activity_id)
    if not activity:
        raise HTTPException(404, "Activity not found")
    task = db.get(models.Task, activity.task_id)

    # Capture info before deletion for audit
    deleted_info = f"{activity.activity_date} — {activity.hours_spent or 0}h — {(activity.description or '')[:100]}"

    db.delete(activity)
    db.flush()

    if task:
        _recalculate_task_stats(task, db)

    db.commit()

    # Audit log — record activity deletion
    if task:
        log_audit(
            db, current_user, "UPDATE", "Task", task.id, task.task_code,
            changes={
                "activity_deleted": {
                    "old": deleted_info,
                    "new": None
                }
            },
        )
