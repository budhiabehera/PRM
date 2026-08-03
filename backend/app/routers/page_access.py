"""Page Access management — controls which roles can see which menu pages."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from .. import models
from ..database import get_db
from ..deps import get_current_user, require_roles

router = APIRouter(prefix="/api/page-access", tags=["Page Access"])


class PageAccessIn(BaseModel):
    page_key: str
    page_label: str
    section: str = "overview"
    roles: List[str]  # ["Admin", "Manager", "Lead", "Developer"]


class BulkPageAccessIn(BaseModel):
    pages: List[PageAccessIn]


@router.get("")
def list_page_access(db: Session = Depends(get_db)):
    """Get all page access rules."""
    items = db.query(models.PageAccess).order_by(models.PageAccess.section, models.PageAccess.page_label).all()
    return [
        {
            "id": p.id,
            "page_key": p.page_key,
            "page_label": p.page_label,
            "section": p.section,
            "roles": [r.strip() for r in p.roles.split(",") if r.strip()],
        }
        for p in items
    ]


@router.get("/for-role/{role}")
def get_pages_for_role(role: str, db: Session = Depends(get_db)):
    """Get all page_keys accessible to a specific role."""
    items = db.query(models.PageAccess).all()
    accessible = []
    for p in items:
        roles_list = [r.strip() for r in p.roles.split(",") if r.strip()]
        if role in roles_list:
            accessible.append(p.page_key)
    return {"role": role, "pages": accessible}


@router.post("/bulk", status_code=200)
def bulk_save_page_access(
    payload: BulkPageAccessIn,
    db: Session = Depends(get_db),
    _admin=Depends(require_roles("Admin")),
):
    """Save all page access rules at once (replaces existing)."""
    # Delete all existing rules
    db.query(models.PageAccess).delete()
    db.flush()

    # Insert new rules
    for page in payload.pages:
        record = models.PageAccess(
            page_key=page.page_key,
            page_label=page.page_label,
            section=page.section,
            roles=",".join(page.roles),
        )
        db.add(record)

    db.commit()
    return {"message": f"Saved {len(payload.pages)} page access rules."}


@router.post("")
def upsert_page_access(
    payload: PageAccessIn,
    db: Session = Depends(get_db),
    _admin=Depends(require_roles("Admin")),
):
    """Create or update a single page access rule."""
    existing = db.query(models.PageAccess).filter(models.PageAccess.page_key == payload.page_key).first()
    if existing:
        existing.page_label = payload.page_label
        existing.section = payload.section
        existing.roles = ",".join(payload.roles)
    else:
        record = models.PageAccess(
            page_key=payload.page_key,
            page_label=payload.page_label,
            section=payload.section,
            roles=",".join(payload.roles),
        )
        db.add(record)
    db.commit()
    return {"message": f"Page access for '{payload.page_key}' saved."}


@router.delete("/{page_id}", status_code=204)
def delete_page_access(
    page_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(require_roles("Admin")),
):
    record = db.query(models.PageAccess).get(page_id)
    if not record:
        raise HTTPException(404, "Page access rule not found")
    db.delete(record)
    db.commit()
