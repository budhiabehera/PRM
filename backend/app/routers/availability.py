from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_roles

router = APIRouter(prefix="/api/availability", tags=["Availability"])


def _to_dict(a: models.Availability) -> dict:
    return {
        "id": a.id,
        "developer_id": a.developer_id,
        "developer_name": a.developer.name if a.developer else None,
        "sprint_id": a.sprint_id,
        "sprint_name": a.sprint.name if a.sprint else None,
        "leave_days": a.leave_days,
        "notes": a.notes,
    }


@router.get("")
def list_availability(
    sprint_id: int | None = None,
    developer_id: int | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.Availability)
    if sprint_id:
        q = q.filter(models.Availability.sprint_id == sprint_id)
    if developer_id:
        q = q.filter(models.Availability.developer_id == developer_id)
    return [_to_dict(a) for a in q.all()]


@router.post("", response_model=schemas.Availability, status_code=201)
def upsert_availability(
    payload: schemas.AvailabilityCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Developers can only set leave for themselves
    if current_user.role == "Developer":
        if not current_user.developer_id:
            raise HTTPException(403, "Your account is not linked to a developer record.")
        if payload.developer_id != current_user.developer_id:
            raise HTTPException(403, "You can only set leave for yourself.")
    elif current_user.role not in ("Admin", "Manager", "Lead"):
        raise HTTPException(403, "You don't have permission to do that.")

    existing = (
        db.query(models.Availability)
        .filter(
            models.Availability.developer_id == payload.developer_id,
            models.Availability.sprint_id == payload.sprint_id,
        )
        .first()
    )
    if existing:
        existing.leave_days = payload.leave_days
        existing.notes = payload.notes
        db.commit()
        db.refresh(existing)
        return existing
    record = models.Availability(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{availability_id}", status_code=204)
def delete_availability(availability_id: int, db: Session = Depends(get_db),
                         current_user: models.User = Depends(get_current_user)):
    record = db.query(models.Availability).get(availability_id)
    if not record:
        raise HTTPException(404, "Availability record not found")
    # Developers can only delete their own leave records
    if current_user.role == "Developer":
        if not current_user.developer_id or record.developer_id != current_user.developer_id:
            raise HTTPException(403, "You can only remove your own leave records.")
    elif current_user.role not in ("Admin", "Manager", "Lead"):
        raise HTTPException(403, "You don't have permission to do that.")
    db.delete(record)
    db.commit()
