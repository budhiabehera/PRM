"""
KB Category master router — CRUD for Knowledge Base categories.
Categories can be global (project_id=NULL) or project-specific.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_

from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_roles
from ..services.audit_service import log_audit

router = APIRouter(prefix="/api/kb-categories", tags=["KB Categories"])


def _enrich(cat: models.KBCategory) -> dict:
    """Convert ORM category to dict with project_name."""
    return {
        "id": cat.id,
        "name": cat.name,
        "project_id": cat.project_id,
        "project_name": cat.project.name if cat.project else None,
        "color": cat.color,
        "sort_order": cat.sort_order,
        "created_at": cat.created_at,
    }


@router.get("", response_model=List[schemas.KBCategoryOut])
def list_categories(
    project_id: Optional[int] = Query(None, description="Filter by project. Returns global + project-specific categories."),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return KB categories. If project_id is given, returns global (null) + that project's categories."""
    q = db.query(models.KBCategory).options(joinedload(models.KBCategory.project))
    if project_id is not None:
        q = q.filter(or_(models.KBCategory.project_id.is_(None), models.KBCategory.project_id == project_id))
    return [
        _enrich(cat) for cat in
        q.order_by(models.KBCategory.sort_order, func.lower(models.KBCategory.name)).all()
    ]


@router.post("", response_model=schemas.KBCategoryOut, status_code=201)
def create_category(
    payload: schemas.KBCategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _user=Depends(require_roles("Admin", "Manager")),
):
    # Unique name within same project scope (global or specific project)
    dup_q = db.query(models.KBCategory).filter(func.lower(models.KBCategory.name) == payload.name.strip().lower())
    if payload.project_id:
        dup_q = dup_q.filter(models.KBCategory.project_id == payload.project_id)
    else:
        dup_q = dup_q.filter(models.KBCategory.project_id.is_(None))
    if dup_q.first():
        raise HTTPException(400, "Category already exists for this project")
    cat = models.KBCategory(
        name=payload.name.strip(),
        project_id=payload.project_id,
        color=payload.color or "#4f46e5",
        sort_order=payload.sort_order or 0,
    )
    db.add(cat)
    db.commit()
    db.refresh(cat)
    # Reload with relationship
    cat = db.query(models.KBCategory).options(joinedload(models.KBCategory.project)).get(cat.id)
    log_audit(db, current_user, "CREATE", "KBCategory", cat.id, cat.name)
    return _enrich(cat)


@router.put("/{cat_id}", response_model=schemas.KBCategoryOut)
def update_category(
    cat_id: int,
    payload: schemas.KBCategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _user=Depends(require_roles("Admin", "Manager")),
):
    cat = db.query(models.KBCategory).options(joinedload(models.KBCategory.project)).get(cat_id)
    if not cat:
        raise HTTPException(404, "Category not found")
    # Check for duplicate name within same project scope (excluding self)
    dup_q = db.query(models.KBCategory).filter(
        func.lower(models.KBCategory.name) == payload.name.strip().lower(),
        models.KBCategory.id != cat_id,
    )
    if payload.project_id:
        dup_q = dup_q.filter(models.KBCategory.project_id == payload.project_id)
    else:
        dup_q = dup_q.filter(models.KBCategory.project_id.is_(None))
    if dup_q.first():
        raise HTTPException(400, "Category name already exists for this project")
    cat.name = payload.name.strip()
    cat.project_id = payload.project_id
    cat.color = payload.color or cat.color
    cat.sort_order = payload.sort_order if payload.sort_order is not None else cat.sort_order
    db.commit()
    db.refresh(cat)
    cat = db.query(models.KBCategory).options(joinedload(models.KBCategory.project)).get(cat.id)
    log_audit(db, current_user, "UPDATE", "KBCategory", cat.id, cat.name)
    return _enrich(cat)


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
