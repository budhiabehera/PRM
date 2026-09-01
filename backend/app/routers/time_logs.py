from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from datetime import date, datetime, timezone, timedelta
from typing import Optional

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user
from ..deps import require_roles
from ..services.daily_hours_check import run_daily_hours_check, get_all_developers_daily_summary

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
    include_activities: bool = Query(True, description="Include hours from task activity log"),
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
    result = [_serialize_time_log(tl) for tl in time_logs]

    # Also include hours from task activity log (PRM_task_activities)
    if include_activities:
        act_query = (
            db.query(models.TaskActivity)
            .options(joinedload(models.TaskActivity.task))
            .filter(models.TaskActivity.developer_id == current_user.developer_id)
        )
        if date_from:
            act_query = act_query.filter(models.TaskActivity.activity_date >= date_from)
        if date_to:
            act_query = act_query.filter(models.TaskActivity.activity_date <= date_to)
        if task_id:
            act_query = act_query.filter(models.TaskActivity.task_id == task_id)

        activities = act_query.all()

        # Aggregate activity hours per task per date (to avoid duplicating with time_logs)
        # Build a set of (task_id, date) from existing time_logs
        existing_keys = {(tl.task_id, tl.date) for tl in time_logs}

        # Group activities by (task_id, date)
        from collections import defaultdict
        act_grouped = defaultdict(float)
        for a in activities:
            key = (a.task_id, a.activity_date)
            act_grouped[key] += (a.hours_spent or 0)

        # Add activity entries that don't already have time_log entries
        for (t_id, d), hours in act_grouped.items():
            if hours > 0:
                task = db.get(models.Task, t_id)
                result.append({
                    "id": None,  # no time_log id — this is from activity log
                    "task_id": t_id,
                    "developer_id": current_user.developer_id,
                    "date": d,
                    "hours": hours,
                    "notes": "(from activity log)",
                    "created_at": None,
                    "task_code": task.task_code if task else None,
                    "task_description": task.description if task else None,
                    "source": "activity_log",
                })

    return result


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


# ─── Daily Hours Check Endpoints ────────────────────────────────────────────


@router.get("/daily-summary")
def daily_summary(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format. Defaults to today (IST)."),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Get all developers' hours summary for a specific date.
    Shows total hours (time_logs + task_activities), leave status, and task breakdown.
    Accessible to all authenticated users.
    """
    from ..services.daily_hours_check import IST, get_today_ist

    if date:
        try:
            from datetime import date as date_type
            parts = date.split("-")
            check_date = date_type(int(parts[0]), int(parts[1]), int(parts[2]))
        except (ValueError, IndexError):
            raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD.")
    else:
        check_date = get_today_ist()

    return get_all_developers_daily_summary(db, check_date, current_user)


@router.post("/check-hours")
def check_hours(
    date: Optional[str] = Query(None, description="Date in YYYY-MM-DD format. Defaults to today (IST)."),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("Admin", "Manager")),
):
    """
    Manually trigger the daily hours check and send reminder emails.
    Admin/Manager only. Checks all active developers and emails those under 8 hours.
    """
    from ..services.daily_hours_check import get_today_ist

    if date:
        try:
            from datetime import date as date_type
            parts = date.split("-")
            check_date = date_type(int(parts[0]), int(parts[1]), int(parts[2]))
        except (ValueError, IndexError):
            raise HTTPException(400, "Invalid date format. Use YYYY-MM-DD.")
    else:
        check_date = get_today_ist()

    return run_daily_hours_check(db, check_date)


@router.post("/schedule-check")
def schedule_check(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("Admin", "Manager")),
):
    """
    Endpoint for automated daily hours check (10 PM IST).
    Called by external scheduler (Task Scheduler, Azure WebJob, or background thread).

    Trigger options:
    - Windows Task Scheduler:
        curl -X POST http://localhost:8001/api/time-logs/schedule-check -H "Authorization: Bearer <admin_token>"
    - Azure App Service WebJob (HTTP trigger)
    - Built-in background scheduler (see main.py startup event)
    """
    from ..services.daily_hours_check import get_today_ist
    check_date = get_today_ist()
    return run_daily_hours_check(db, check_date)
