"""
Notification service — helper functions for creating in-app notifications.
"""

from sqlalchemy.orm import Session
from .. import models


def create_notification(
    db: Session,
    user_id: int,
    type: str,
    title: str,
    message: str = "",
    task_id: int | None = None,
) -> models.Notification:
    """Create and persist a new notification for a user."""
    notification = models.Notification(
        user_id=user_id,
        type=type,
        title=title,
        message=message,
        task_id=task_id,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification
