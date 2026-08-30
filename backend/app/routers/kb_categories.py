"""
KB Category master router — CRUD for Knowledge Base categories.
"""
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_roles
from ..services.audit_service import log_audit

router = APIRouter(prefix="/api/kb-categories", tags=["KB Categories"])


@router.get("", response_model=List[schemas.KBCategoryOut])
def list_categories(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """Return all KB categories ordered by sort_order then name."""
    return (
        db.query(models.KBCategory)
        .order_by(models.KBCategory.sort_order, func.lower(models.KBCategory.name))
        .all()
    )


@router.post("", response_model=schemas.KBCategoryOut, status_code=201)
def create_category(
    payload: schemas.KBCategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _user=Depends(require_roles("Admin", "Manager")),
):
    if db.query(models.KBCategory).filter(func.lower(models.KBCategory.name) == payload.name.strip().lower()).first():
        raise HTTPException(400, "Category already exists")
    cat = models.KBCategory(
        name=payload.name.strip(),
        color=payload.color or "#4f46e5",
        sort_order=payload.sort_order or 0,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    log_audit(db, current_user, "CREATE", "KBCategory", cat.id, cat.name)
    return cat


@router.put("/{cat_id}", response_model=schemas.KBCategoryOut)
def update_category(
    cat_id: int,
    payload: schemas.KBCategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _user=Depends(require_roles("Admin", "Manager")),
):
    cat = db.get(models.KBCategory, cat_id)
    if not cat:
        raise HTTPException(404, "Category not found")
    # Check for duplicate name (excluding self)
    existing = db.query(models.KBCategory).filter(
        func.lower(models.KBCategory.name) == payload.name.strip().lower(),
        models.KBCategory.id != cat_id,
    ).first()
    if existing:
        raise HTTPException(400, "Category name already exists")
    cat.name = payload.name.strip()
    cat.color = payload.color or cat.color
    cat.sort_order = payload.sort_order if payload.sort_order is not None else cat.sort_order
    db.commit()
    db.refresh(cat)
    log_audit(db, current_user, "UPDATE", "KBCategory", cat.id, cat.name)
    return cat


@router.delete("/{cat_id}", status_code=204)
def delete_category(
    cat_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _user=Depends(require_roles("Admin", "Manager")),
):
    cat = db.get(models.KBCategory, cat_id)
    if not cat:
        raise HTTPException(404, "Category not found")
    cat_name = cat.name
    db.delete(cat)
    db.commit()
    log_audit(db, current_user, "DELETE", "KBCategory", cat_id, cat_name)
