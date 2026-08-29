from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user

router = APIRouter(prefix="/api/role-capacities", tags=["Role Capacities"])


@router.get("")
def list_role_capacities(db: Session = Depends(get_db)):
    """Get all role-capacity mappings."""
    items = db.query(models.RoleCapacity).order_by(models.RoleCapacity.role).all()
    return [
        {
            "id": rc.id,
            "role": rc.role,
            "capacity_hours": rc.capacity_hours,
            "description": rc.description,
            "created_at": rc.created_at,
        }
        for rc in items
    ]


@router.get("/by-role/{role}")
def get_capacity_by_role(role: str, db: Session = Depends(get_db)):
    """Get capacity for a specific role (used by User Setup form)."""
    rc = db.query(models.RoleCapacity).filter(models.RoleCapacity.role == role).first()
    if not rc:
        return {"role": role, "capacity_hours": 192}  # default fallback
    return {"role": rc.role, "capacity_hours": rc.capacity_hours}


@router.post("", status_code=201)
def create_role_capacity(
    payload: schemas.RoleCapacityCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create a role-capacity mapping."""
    existing = db.query(models.RoleCapacity).filter(models.RoleCapacity.role == payload.role).first()
    if existing:
        raise HTTPException(409, f"Role '{payload.role}' already has a capacity defined. Use PUT to update.")

    rc = models.RoleCapacity(
        role=payload.role,
        capacity_hours=payload.capacity_hours,
        description=payload.description or "",
    )
    db.add(rc)
    db.commit()
    db.refresh(rc)
    return {
        "id": rc.id,
        "role": rc.role,
        "capacity_hours": rc.capacity_hours,
        "description": rc.description,
        "created_at": rc.created_at,
    }


@router.put("/{rc_id}")
def update_role_capacity(
    rc_id: int,
    payload: schemas.RoleCapacityCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Update a role-capacity mapping."""
    rc = db.get(models.RoleCapacity, rc_id)
    if not rc:
        raise HTTPException(404, "Role capacity not found")

    # Check for duplicate role if role name changed
    if payload.role != rc.role:
        existing = db.query(models.RoleCapacity).filter(
            models.RoleCapacity.role == payload.role,
            models.RoleCapacity.id != rc_id,
        ).first()
        if existing:
            raise HTTPException(409, f"Role '{payload.role}' already exists")

    rc.role = payload.role
    rc.capacity_hours = payload.capacity_hours
    rc.description = payload.description or ""
    db.commit()
    db.refresh(rc)
    return {
        "id": rc.id,
        "role": rc.role,
        "capacity_hours": rc.capacity_hours,
        "description": rc.description,
        "created_at": rc.created_at,
    }


@router.delete("/{rc_id}", status_code=204)
def delete_role_capacity(
    rc_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Delete a role-capacity mapping."""
    rc = db.get(models.RoleCapacity, rc_id)
    if not rc:
        raise HTTPException(404, "Role capacity not found")
    db.delete(rc)
    db.commit()
