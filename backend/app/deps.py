from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from . import models
from .database import get_db
from .auth import decode_access_token

# ── Canonical task status strings — single source of truth ──────────────
# These must match the values stored in PRM_task_statuses / PRM_tasks.status.
# Import these instead of sprinkling string literals across routers/services.
STATUS_COMPLETED = "Completed"
STATUS_NOT_STARTED = "Not Started"
STATUS_IN_PROGRESS = "In Progress"
STATUS_QA_WIP = "QA-WIP"
STATUS_QA_STAGING = "QA-Staging"
STATUS_DEPLOYED = "Deployed"
STATUS_ON_HOLD = "On Hold"
STATUS_CANCELLED = "Cancelled"

# Grouped sets for common comparisons
DONE_STATUSES = {STATUS_COMPLETED, STATUS_DEPLOYED}
ACTIVE_STATUSES = {STATUS_IN_PROGRESS, STATUS_QA_WIP, STATUS_QA_STAGING}
CLOSED_STATUSES = DONE_STATUSES | {STATUS_CANCELLED}

# Also accept variant spellings found in legacy data
IN_PROGRESS_VARIANTS = {"In Progress", "Inprogress"}
ON_HOLD_VARIANTS = {"On Hold", "OnHold"}

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
        except Exception:
            pass  # table might not exist yet
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
    except Exception:
        pass  # table might not exist yet on fresh deploy
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
    if user.role == "Admin":
        return None  # Only Admin sees everything
    # For Manager/Lead/Developer — check their user.projects (many-to-many)
    project_ids = [p.id for p in user.projects]
    if not project_ids and user.developer_id:
        # Fallback: check developer's project assignments
        dev = user.developer
        if dev:
            project_ids = [p.id for p in dev.projects]
    return project_ids


# --- Management roles to exclude from operational views ---
# These roles (SVP-Product, AVP-Product, Product Manager) should not appear in
# time logs, sprint tracking, utilization, standup, or any developer-level views.
# Kept as fallback; prefer get_management_excluded_roles(db) for DB-driven config.
MANAGEMENT_EXCLUDED_ROLES = {
    "svp product", "svp-product",
    "avp product", "avp-product",
    "product manager", "product-manager",
}


def get_management_excluded_roles(db: Session | None = None) -> set[str]:
    """Read management_excluded_roles from IntegrationSettings (DB).
    Falls back to the hardcoded MANAGEMENT_EXCLUDED_ROLES constant."""
    if db is not None:
        try:
            settings = db.get(models.IntegrationSettings, 1)
            if settings and settings.management_excluded_roles:
                raw = settings.management_excluded_roles  # comma-separated string
                roles = set()
                for r in raw.split(","):
                    stripped = r.strip()
                    if stripped:
                        roles.add(stripped.lower())
                return roles
        except Exception:
            pass  # table may not exist yet on fresh deploy
    return set(MANAGEMENT_EXCLUDED_ROLES)


def filter_operational_developers(query, model=None, db: Session | None = None):
    """Apply the management role exclusion filter to a Developer query.
    Usage: query = filter_operational_developers(db.query(Developer).filter(...))
    """
    M = model or models.Developer
    for role in get_management_excluded_roles(db):
        query = query.filter(M.role.notilike(role))
    return query

# Statuses that represent future/planning tasks — excluded from sprint capacity calculations
PLANNING_STATUSES = {"backlog", "new", "unassigned"}


def _get_role_data_scope(user: models.User, db) -> str:
    """Look up admin-configured data scope for the user's role.
    Returns: 'self_only', 'team_reports', 'team', or 'full'."""
    if not db or not user:
        return "full" if user and user.role == "Admin" else "self_only"
    scope_row = db.query(models.RoleDataScope).filter(
        models.RoleDataScope.role == user.role
    ).first()
    if scope_row:
        return scope_row.data_scope
    # Default: Admin=full, others=self_only
    return "full" if user.role == "Admin" else "self_only"


def get_visible_developer_ids(user: models.User, project_id: int = None, db=None) -> list[int] | None:
    """Return developer IDs that a user can see based on admin-configured data scope.
    Returns None for full/team-access users (no filter needed).
    Returns list of IDs for team_reports/self_only users.
    
    Data scopes (configured in Page Access > Data Scope per Role):
    - full:         None (see all developers in project)
    - team:         None (see all developers in project)
    - team_reports: self + direct reports (from OrgHierarchy + Developer.reporting_to_id)
    - self_only:    only themselves
    """
    if not user:
        return None
    
    scope = _get_role_data_scope(user, db) if db else "self_only"
    
    # Full or team scope: no developer-level filter
    if scope in ("full", "team"):
        return None
    
    dev_id = user.developer_id
    if not dev_id:
        return []
    
    # team_reports: self + direct reports
    if scope == "team_reports" and db:
        direct_report_ids = set()
        
        # Source 1: Developer.reporting_to_id (set in User Setup)
        from_dev_table = db.query(models.Developer.id).filter(
            models.Developer.reporting_to_id == dev_id,
            models.Developer.active == True,
        ).all()
        direct_report_ids.update(r[0] for r in from_dev_table)
        
        # Source 2: OrgHierarchy table (set in Org Hierarchy page)
        from_org_table = db.query(models.OrgHierarchy.developer_id).filter(
            models.OrgHierarchy.reports_to_id == dev_id,
        ).all()
        direct_report_ids.update(r[0] for r in from_org_table)
        
        return [dev_id] + list(direct_report_ids)
    
    # self_only: only themselves
    return [dev_id]
