from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/holidays", tags=["Holidays"])


def _serialize_holiday(h):
    return {
        "id": h.id,
        "date": h.date,
        "name": h.name,
        "month": h.month,
        "year": h.year,
        "created_by_id": h.created_by_id,
        "created_by_name": h.created_by.full_name if h.created_by else None,
        "created_at": h.created_at,
    }


@router.get("")
def list_holidays(
    month: int | None = None,
    year: int | None = None,
    db: Session = Depends(get_db),
):
    """Get holidays, optionally filtered by month and year."""
    q = db.query(models.Holiday)
    if year:
        q = q.filter(models.Holiday.year == year)
    if month:
        q = q.filter(models.Holiday.month == month)
    holidays = q.order_by(models.Holiday.date).all()
    return [_serialize_holiday(h) for h in holidays]


@router.post("", status_code=201)
def create_holiday(
    payload: schemas.HolidayCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Add a holiday. Duplicate dates are rejected."""
    # Check for duplicate
    existing = db.query(models.Holiday).filter(models.Holiday.date == payload.date).first()
    if existing:
        raise HTTPException(409, f"Holiday already exists on {payload.date}: {existing.name}")

    holiday = models.Holiday(
        date=payload.date,
        name=payload.name,
        month=payload.date.month,
        year=payload.date.year,
        created_by_id=current_user.id,
    )
    db.add(holiday)
    db.commit()
    db.refresh(holiday)
    return _serialize_holiday(holiday)


@router.put("/{holiday_id}")
def update_holiday(
    holiday_id: int,
    payload: schemas.HolidayCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update a holiday's name or date."""
    holiday = db.query(models.Holiday).get(holiday_id)
    if not holiday:
        raise HTTPException(404, "Holiday not found")

    # Check duplicate if date changed
    if payload.date != holiday.date:
        existing = db.query(models.Holiday).filter(
            models.Holiday.date == payload.date,
            models.Holiday.id != holiday_id,
        ).first()
        if existing:
            raise HTTPException(409, f"Holiday already exists on {payload.date}: {existing.name}")

    holiday.date = payload.date
    holiday.name = payload.name
    holiday.month = payload.date.month
    holiday.year = payload.date.year
    db.commit()
    db.refresh(holiday)
    return _serialize_holiday(holiday)


@router.delete("/{holiday_id}", status_code=204)
def delete_holiday(
    holiday_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete a holiday."""
    holiday = db.query(models.Holiday).get(holiday_id)
    if not holiday:
        raise HTTPException(404, "Holiday not found")
    db.delete(holiday)
    db.commit()
