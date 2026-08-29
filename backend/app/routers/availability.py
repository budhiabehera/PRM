from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from datetime import date, timedelta
from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_roles, get_user_project_ids

router = APIRouter(prefix="/api/availability", tags=["Availability"])


def _count_working_days(start: date, end: date, db: Session) -> int:
    """Count weekdays (Mon-Fri) between start and end (inclusive), excluding holidays."""
    if not start or not end:
        return 0
    # Get holidays in this date range
    holidays = (
        db.query(models.Holiday.date)
        .filter(models.Holiday.date >= start, models.Holiday.date <= end)
        .all()
    )
    holiday_set = {h[0] for h in holidays}

    count = 0
    current = start
    while current <= end:
        # weekday(): 0=Mon, 4=Fri, 5=Sat, 6=Sun
        if current.weekday() < 5 and current not in holiday_set:
            count += 1
        current += timedelta(days=1)
    return count


def _to_dict(a: models.Availability) -> dict:
    return {
        "id": a.id,
        "developer_id": a.developer_id,
        "developer_name": a.developer.name if a.developer else None,
        "sprint_id": a.sprint_id,
        "sprint_name": a.sprint.name if a.sprint else None,
        "start_date": a.start_date,
        "end_date": a.end_date,
        "leave_days": a.leave_days,
        "reduced_hours": (a.leave_days or 0) * 8,
        "notes": a.notes,
    }


@router.get("")
def list_availability(
    sprint_id: int | None = None,
    developer_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Availability).options(
        joinedload(models.Availability.developer),
        joinedload(models.Availability.sprint),
    )
    # Filter to developers within user's project access
    allowed = get_user_project_ids(current_user)
    if allowed is not None:
        from ..models import developer_projects
        allowed_dev_ids = [row[0] for row in db.query(developer_projects.c.developer_id).filter(
            developer_projects.c.project_id.in_(allowed)).all()]
        q = q.filter(models.Availability.developer_id.in_(allowed_dev_ids))
    if sprint_id:
        q = q.filter(models.Availability.sprint_id == sprint_id)
    if developer_id:
        q = q.filter(models.Availability.developer_id == developer_id)
    return [_to_dict(a) for a in q.all()]


@router.post("", status_code=201)
def upsert_availability(
    payload: schemas.AvailabilityCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Developers can only set leave for themselves
    is_admin_or_lead = current_user.role in ("Admin", "Manager", "Lead")
    if not is_admin_or_lead:
        # Non-admin users can only set leave for themselves
        if not current_user.developer_id:
            raise HTTPException(403, "Your account is not linked to a developer record.")
        if payload.developer_id != current_user.developer_id:
            raise HTTPException(403, "You can only set leave for yourself.")

    # Auto-calculate leave_days from start_date and end_date
    leave_days = payload.leave_days or 0
    if payload.start_date and payload.end_date:
        if payload.end_date < payload.start_date:
            raise HTTPException(400, "End date must be after start date.")
        leave_days = _count_working_days(payload.start_date, payload.end_date, db)

    existing = (
        db.query(models.Availability)
        .filter(
            models.Availability.developer_id == payload.developer_id,
            models.Availability.sprint_id == payload.sprint_id,
        )
        .first()
    )
    if existing:
        existing.start_date = payload.start_date
        existing.end_date = payload.end_date
        existing.leave_days = leave_days
        existing.notes = payload.notes
        db.commit()
        db.refresh(existing)
        return _to_dict(existing)

    record = models.Availability(
        developer_id=payload.developer_id,
        sprint_id=payload.sprint_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        leave_days=leave_days,
        notes=payload.notes,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _to_dict(record)


@router.delete("/{availability_id}", status_code=204)
def delete_availability(availability_id: int, db: Session = Depends(get_db),
                         current_user: models.User = Depends(get_current_user)):
    record = db.get(models.Availability, availability_id)
    if not record:
        raise HTTPException(404, "Leave record not found")
    # Developers can only delete their own leave records
    is_admin_or_lead = current_user.role in ("Admin", "Manager", "Lead")
    if not is_admin_or_lead:
        if not current_user.developer_id or record.developer_id != current_user.developer_id:
            raise HTTPException(403, "You can only remove your own leave records.")
    db.delete(record)
    db.commit()
