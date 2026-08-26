"""Audit logging service — records create/update/delete actions."""
import json
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from .. import models

IST = timezone(timedelta(hours=5, minutes=30))


def log_audit(
    db: Session,
    user,
    action: str,
    entity_type: str,
    entity_id: int,
    entity_label: str,
    changes: dict | None = None,
    ip_address: str | None = None,
):
    """Log an audit entry. Call this after any create/update/delete.

    Args:
        db: SQLAlchemy session
        user: User model instance (or None for system actions)
        action: "CREATE", "UPDATE", "DELETE"
        entity_type: e.g. "Task", "Project", "User", "KBArticle"
        entity_id: ID of the affected record
        entity_label: human-readable label (e.g. task_code, project name)
        changes: dict like {"field": {"old": "...", "new": "..."}} for updates
        ip_address: optional IP address of the request
    """
    changes_json = json.dumps(changes) if changes else None

    entry = models.AuditLog(
        user_id=user.id if user else None,
        user_name=user.full_name if user and hasattr(user, "full_name") else (user.name if user and hasattr(user, "name") else None),
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        entity_label=entity_label,
        changes=changes_json,
        ip_address=ip_address,
        created_at=datetime.now(IST),
    )
    db.add(entry)
    db.commit()
