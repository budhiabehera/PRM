"""Audit Log router — view and search the audit trail."""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from .. import models
from ..database import get_db
from ..deps import require_roles

router = APIRouter(prefix="/api/audit-logs", tags=["Audit Log"])


@router.get("")
def list_audit_logs(
    entity_type: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    action: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _admin=Depends(require_roles("Admin", "Manager")),
):
    """List audit logs with filters. Only Admin and Manager roles."""
    q = db.query(models.AuditLog)

    if entity_type:
        q = q.filter(models.AuditLog.entity_type == entity_type)
    if user_id:
        q = q.filter(models.AuditLog.user_id == user_id)
    if action:
        q = q.filter(models.AuditLog.action == action)
    if date_from:
        q = q.filter(models.AuditLog.created_at >= date_from)
    if date_to:
        q = q.filter(models.AuditLog.created_at <= date_to + "T23:59:59")
    if search:
        q = q.filter(models.AuditLog.entity_label.ilike(f"%{search}%"))

    total = q.count()
    items = (
        q.order_by(models.AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": [
            {
                "id": item.id,
                "user_id": item.user_id,
                "user_name": item.user_name,
                "action": item.action,
                "entity_type": item.entity_type,
                "entity_id": item.entity_id,
                "entity_label": item.entity_label,
                "changes": item.changes,
                "ip_address": item.ip_address,
                "created_at": item.created_at.isoformat() if item.created_at else None,
            }
            for item in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/entity-types")
def get_entity_types(
    db: Session = Depends(get_db),
    _admin=Depends(require_roles("Admin", "Manager")),
):
    """Return distinct entity_types in the audit log."""
    rows = (
        db.query(models.AuditLog.entity_type)
        .distinct()
        .order_by(models.AuditLog.entity_type)
        .all()
    )
    return [r[0] for r in rows if r[0]]
