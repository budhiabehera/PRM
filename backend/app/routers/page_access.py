"""Page Access management — controls which roles can see which menu pages."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import json
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
    current_user: models.User = Depends(require_roles("Admin")),
):
    """Save all page access rules at once (replaces existing)."""
    # --- Audit: snapshot BEFORE ---
    old_rules = db.query(models.PageAccess).order_by(models.PageAccess.page_key).all()
    snapshot_before = [{"page_key": r.page_key, "page_label": r.page_label,
                        "section": r.section, "roles": r.roles} for r in old_rules]
    snapshot_after = [{"page_key": p.page_key, "page_label": p.page_label,
                       "section": p.section, "roles": ",".join(p.roles)} for p in payload.pages]
    audit = models.PageAccessAudit(
        action="page_access_save",
        changed_by=current_user.username if current_user else "unknown",
        snapshot_before=json.dumps(snapshot_before, default=str),
        snapshot_after=json.dumps(snapshot_after, default=str),
        summary=f"Saved {len(payload.pages)} page access rules (was {len(old_rules)} rules)",
    )
    db.add(audit)

    # Delete all existing rules and replace
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
    record = db.get(models.PageAccess, page_id)
    if not record:
        raise HTTPException(404, "Page access rule not found")
    db.delete(record)
    db.commit()


# ── Role Data Scope ──────────────────────────────────────────────
# Controls whether a role sees only own data (self_only), team data (team), or all data (full)

class RoleDataScopeIn(BaseModel):
    role: str
    data_scope: str  # "self_only" | "team" | "full"


class BulkRoleDataScopeIn(BaseModel):
    scopes: List[RoleDataScopeIn]


@router.get("/data-scopes")
def list_data_scopes(db: Session = Depends(get_db)):
    """Get all role data scope settings."""
    items = db.query(models.RoleDataScope).order_by(models.RoleDataScope.role).all()
    return [{"role": s.role, "data_scope": s.data_scope} for s in items]


@router.get("/data-scope/{role}")
def get_role_data_scope(role: str, db: Session = Depends(get_db)):
    """Get data scope for a specific role. Defaults to self_only if not configured."""
    item = db.query(models.RoleDataScope).filter(models.RoleDataScope.role == role).first()
    if item:
        return {"role": item.role, "data_scope": item.data_scope}
    # Default: Admin=full, otherwise self_only
    default = "full" if role == "Admin" else "self_only"
    return {"role": role, "data_scope": default}


@router.post("/data-scopes/bulk", status_code=200)
def bulk_save_data_scopes(
    payload: BulkRoleDataScopeIn,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("Admin")),
):
    """Save all role data scope settings at once (replaces existing)."""
    # --- Audit: snapshot BEFORE ---
    old_scopes = db.query(models.RoleDataScope).order_by(models.RoleDataScope.role).all()
    snapshot_before = [{"role": s.role, "data_scope": s.data_scope} for s in old_scopes]
    snapshot_after = [{"role": s.role, "data_scope": s.data_scope} for s in payload.scopes]
    # Build diff summary
    old_map = {s.role: s.data_scope for s in old_scopes}
    changes = [f"{s.role}: {old_map.get(s.role, '?')} -> {s.data_scope}"
               for s in payload.scopes if old_map.get(s.role) != s.data_scope]
    audit = models.PageAccessAudit(
        action="data_scope_save",
        changed_by=current_user.username if current_user else "unknown",
        snapshot_before=json.dumps(snapshot_before, default=str),
        snapshot_after=json.dumps(snapshot_after, default=str),
        summary="; ".join(changes) if changes else "No changes",
    )
    db.add(audit)

    db.query(models.RoleDataScope).delete()
    db.flush()
    for s in payload.scopes:
        record = models.RoleDataScope(role=s.role, data_scope=s.data_scope)
        db.add(record)
    db.commit()
    return {"message": f"Saved {len(payload.scopes)} role data scopes."}


@router.get("/audit-history")
def get_audit_history(
    limit: int = 50,
    db: Session = Depends(get_db),
    _admin=Depends(require_roles("Admin")),
):
    """Get recent page access audit history for disaster recovery."""
    records = (
        db.query(models.PageAccessAudit)
        .order_by(models.PageAccessAudit.id.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id,
            "action": r.action,
            "changed_by": r.changed_by,
            "changed_at": r.changed_at,
            "summary": r.summary,
            "snapshot_before": json.loads(r.snapshot_before) if r.snapshot_before else [],
            "snapshot_after": json.loads(r.snapshot_after) if r.snapshot_after else [],
        }
        for r in records
    ]


@router.post("/restore/{audit_id}")
def restore_from_audit(
    audit_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("Admin")),
):
    """Restore page access or data scopes from an audit snapshot (uses snapshot_before)."""
    audit = db.get(models.PageAccessAudit, audit_id)
    if not audit:
        raise HTTPException(404, "Audit record not found")

    snapshot = json.loads(audit.snapshot_before)
    if not snapshot:
        raise HTTPException(400, "Snapshot is empty, nothing to restore")

    if audit.action == "page_access_save":
        # Snapshot before restore for audit trail
        current = db.query(models.PageAccess).all()
        current_snap = [{"page_key": r.page_key, "page_label": r.page_label,
                         "section": r.section, "roles": r.roles} for r in current]
        # Restore
        db.query(models.PageAccess).delete()
        db.flush()
        for item in snapshot:
            db.add(models.PageAccess(
                page_key=item["page_key"],
                page_label=item.get("page_label", ""),
                section=item.get("section", "overview"),
                roles=item.get("roles", ""),
            ))
        # Log the restore itself
        db.add(models.PageAccessAudit(
            action="page_access_restore",
            changed_by=current_user.username,
            snapshot_before=json.dumps(current_snap, default=str),
            snapshot_after=json.dumps(snapshot, default=str),
            summary=f"Restored from audit #{audit_id} ({audit.changed_at})",
        ))
        db.commit()
        return {"message": f"Restored {len(snapshot)} page access rules from audit #{audit_id}"}

    elif audit.action == "data_scope_save":
        current = db.query(models.RoleDataScope).all()
        current_snap = [{"role": s.role, "data_scope": s.data_scope} for s in current]
        db.query(models.RoleDataScope).delete()
        db.flush()
        for item in snapshot:
            db.add(models.RoleDataScope(role=item["role"], data_scope=item["data_scope"]))
        db.add(models.PageAccessAudit(
            action="data_scope_restore",
            changed_by=current_user.username,
            snapshot_before=json.dumps(current_snap, default=str),
            snapshot_after=json.dumps(snapshot, default=str),
            summary=f"Restored from audit #{audit_id} ({audit.changed_at})",
        ))
        db.commit()
        return {"message": f"Restored {len(snapshot)} data scopes from audit #{audit_id}"}

    else:
        raise HTTPException(400, f"Cannot restore action type: {audit.action}")
