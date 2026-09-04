# -*- coding: utf-8 -*-
"""Org Hierarchy - per-project reporting structure based on User Setup project access."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from pydantic import BaseModel
from typing import List, Optional
from .. import models
from ..database import get_db
from ..deps import get_current_user, require_roles

router = APIRouter(prefix="/api/org-hierarchy", tags=["Org Hierarchy"])


class OrgEntryIn(BaseModel):
    user_id: int
    reports_to_user_id: Optional[int] = None


class BulkOrgIn(BaseModel):
    project_id: int
    entries: List[OrgEntryIn]


@router.get("")
def get_org_hierarchy(
    project_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get org hierarchy for a project - shows developers assigned via User Setup."""
    # Get existing hierarchy entries for this project
    entries = (
        db.query(models.OrgHierarchy)
        .filter(models.OrgHierarchy.project_id == project_id)
        .all()
    )
    entry_map = {e.developer_id: e.reports_to_id for e in entries}

    # Get developers assigned to this project (via developer_projects - the authoritative source)
    from ..models import developer_projects
    project_dev_ids = [
        row[0] for row in db.query(developer_projects.c.developer_id)
        .filter(developer_projects.c.project_id == project_id).all()
    ]

    # Load developers with their user accounts eagerly
    devs = (
        db.query(models.Developer)
        .options(joinedload(models.Developer.user_account),
                 joinedload(models.Developer.reporting_to))
        .filter(
            models.Developer.id.in_(project_dev_ids),
            models.Developer.active == True,
        )
        .order_by(func.lower(models.Developer.name))
        .all()
    )

    # Build lookup for reporting_to name resolution
    dev_lookup = {d.id: d for d in devs}

    result = []
    for dev in devs:
        user = dev.user_account
        reports_to_id = entry_map.get(dev.id)
        # Fallback: if no org hierarchy entry, use developer.reporting_to_id from User Setup
        if not reports_to_id and dev.reporting_to_id:
            reports_to_id = dev.reporting_to_id
        reports_to_dev = dev_lookup.get(reports_to_id) if reports_to_id else dev.reporting_to if dev.reporting_to_id else None
        result.append({
            "id": dev.id,
            "developer_name": dev.name,
            "username": user.username if user else None,
            "role": dev.role or (user.role if user else None),
            "skill": dev.skill,
            "reports_to_id": reports_to_id,
            "reports_to_name": reports_to_dev.name if reports_to_dev and hasattr(reports_to_dev, 'name') else None,
        })

    return {"project_id": project_id, "members": result}


@router.post("/bulk")
def save_org_hierarchy(
    payload: BulkOrgIn,
    db: Session = Depends(get_db),
    _user=Depends(require_roles("Admin", "Manager", "Development Manager")),
):
    """Save/replace org hierarchy for a project."""
    db.query(models.OrgHierarchy).filter(
        models.OrgHierarchy.project_id == payload.project_id
    ).delete()
    db.flush()

    for entry in payload.entries:
        record = models.OrgHierarchy(
            project_id=payload.project_id,
            developer_id=entry.user_id,
            reports_to_id=entry.reports_to_user_id,
        )
        db.add(record)

    db.commit()
    return {"message": "Saved {} org hierarchy entries.".format(len(payload.entries))}


@router.get("/reporting-to/{dev_id}")
def get_reporting_to(
    dev_id: int,
    project_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Get who a developer reports to in a specific project."""
    entry = (
        db.query(models.OrgHierarchy)
        .filter(
            models.OrgHierarchy.project_id == project_id,
            models.OrgHierarchy.developer_id == dev_id,
        )
        .first()
    )
    if entry and entry.reports_to_id:
        dev = db.get(models.Developer, entry.reports_to_id)
        if dev:
            return {"reports_to_id": entry.reports_to_id, "reports_to_name": dev.name}
    return {"reports_to_id": None, "reports_to_name": None}
