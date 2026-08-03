from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .auth import decode_access_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

ROLE_HIERARCHY = {"Admin": 4, "Manager": 3, "Lead": 2, "Developer": 1}


def get_current_user(token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> models.User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise credentials_error
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise credentials_error
    user = db.query(models.User).get(int(payload["sub"]))
    if not user or not user.active:
        raise credentials_error
    return user


def require_roles(*allowed_roles: str):
    """Dependency factory: raises 403 unless current_user.role is in allowed_roles."""
    def dependency(current_user: models.User = Depends(get_current_user)) -> models.User:
        if current_user.role in allowed_roles:
            return current_user
        # Check page_access table: if user's role has been granted access to
        # admin pages, treat them as having the equivalent API permission.
        from .database import SessionLocal
        db = SessionLocal()
        try:
            admin_pages = db.query(models.PageAccess).filter(
                models.PageAccess.section == "admin"
            ).all()
            for page in admin_pages:
                role_list = [r.strip() for r in page.roles.split(",") if r.strip()]
                if current_user.role in role_list:
                    return current_user
        finally:
            db.close()
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="You don't have permission to do that.")
    return dependency


def _has_admin_page_access(role: str) -> bool:
    """Check if a role has been granted access to any admin page."""
    from .database import SessionLocal
    db = SessionLocal()
    try:
        admin_pages = db.query(models.PageAccess).filter(models.PageAccess.section == "admin").all()
        for page in admin_pages:
            role_list = [r.strip() for r in page.roles.split(",") if r.strip()]
            if role in role_list:
                return True
    finally:
        db.close()
    return False


def can_edit_task(user: models.User, task: models.Task) -> bool:
    """Admin/Manager/Lead can edit any task. Developers can only edit tasks
    assigned to their own linked Developer record."""
    if user.role in ("Admin", "Manager", "Lead"):
        return True
    if _has_admin_page_access(user.role):
        return True
    # Fallback: user can only edit their own tasks
    return user.developer_id is not None and task.developer_id == user.developer_id


def can_delete_task(user: models.User) -> bool:
    """Only Admin/Manager/Lead may delete tasks; Developers never can."""
    if user.role in ("Admin", "Manager", "Lead"):
        return True
    return _has_admin_page_access(user.role)


DEVELOPER_EDITABLE_FIELDS = {
    "status", "actual_hours", "description", "estimated_hours",
    "start_date", "end_date", "case_ref", "property_client",
    "project_id", "main_module_id", "sub_module_id", "work_type_id", "sprint_id", "priority",
}


def restrict_fields_for_developer(user: models.User, update_data: dict) -> dict:
    """If a Developer is editing their own task, silently drop any field they
    aren't allowed to change (they can update status/actual hours only —
    not reassign, reprioritize, or reschedule)."""
    if user.role == "Developer":
        return {k: v for k, v in update_data.items() if k in DEVELOPER_EDITABLE_FIELDS}
    return update_data


def get_user_project_ids(user: models.User) -> list[int] | None:
    """Return list of project IDs the user has access to.
    Returns None for Admin (meaning 'all projects' — no filter needed).
    Returns empty list if user has no assigned projects (sees nothing)."""
    if user.role == "Admin" or _has_admin_page_access(user.role):
        return None  # Admin sees everything
    # For Manager/Lead/Developer — check their user.projects (many-to-many)
    project_ids = [p.id for p in user.projects]
    if not project_ids and user.developer_id:
        # Fallback: check developer's project assignments
        dev = user.developer
        if dev:
            project_ids = [p.id for p in dev.projects]
    return project_ids
