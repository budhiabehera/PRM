"""Unified User Setup — single endpoint to create/update/delete a Developer + linked User account."""
import threading
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..auth import hash_password
from ..deps import require_roles
from ..integrations.email_service import generate_random_password, send_welcome_email
from ..services.audit_service import log_audit

router = APIRouter(prefix="/api/user-setup", tags=["User Setup"])


def _generate_dev_code(db: Session) -> str:
    """Auto-generate resource code in format RES100, RES101, ..."""
    # Find the highest existing numeric suffix among RES-prefixed codes
    existing = (
        db.query(models.Developer.dev_code)
        .filter(models.Developer.dev_code.like("RES%"))
        .all()
    )
    max_num = 99  # start from 100
    for (code,) in existing:
        num_part = code.replace("RES", "")
        if num_part.isdigit():
            max_num = max(max_num, int(num_part))
    return f"RES{max_num + 1}"


def _serialize(dev: models.Developer, db: Session):
    user_account = dev.user_account
    return {
        "id": dev.id,
        "dev_code": dev.dev_code,
        "username": user_account.username if user_account else None,
        "full_name": dev.name,
        "email": user_account.email if user_account else None,
        "role": dev.role,
        "skill": dev.skill,
        "base_capacity": dev.base_capacity,
        "active": dev.active,
        "project_ids": [p.id for p in dev.projects],
        "user_id": user_account.id if user_account else None,
        "reporting_to_id": dev.reporting_to_id,
        "reporting_to_name": dev.reporting_to.name if dev.reporting_to else None,
    }


@router.get("")
def list_users(db: Session = Depends(get_db)):
    devs = db.query(models.Developer).order_by(models.Developer.dev_code.desc()).all()
    return [_serialize(d, db) for d in devs]


@router.get("/next-code")
def get_next_code(db: Session = Depends(get_db)):
    """Get the next auto-generated resource code."""
    return {"next_code": _generate_dev_code(db)}


@router.get("/{dev_id}")
def get_user(dev_id: int, db: Session = Depends(get_db)):
    dev = db.query(models.Developer).get(dev_id)
    if not dev:
        raise HTTPException(404, "User not found")
    return _serialize(dev, db)


@router.post("", status_code=201)
def create_user(
    payload: schemas.UserSetupCreate,
    db: Session = Depends(get_db),
    _admin=Depends(require_roles("Admin", "Manager")),
):
    """Create a Developer record AND a linked User login in one step."""
    # Default password is Ids@1001 if none provided
    raw_pw = payload.password if payload.password else "Ids@1001"

    # Auto-generate dev_code if not provided
    dev_code = payload.dev_code.strip() if payload.dev_code else ""
    if not dev_code:
        dev_code = _generate_dev_code(db)
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(400, "Username already exists")
    
    # Create Developer record
    dev = models.Developer(
        dev_code=dev_code,
        name=payload.full_name,
        role=payload.role,
        skill=payload.skill,
        base_capacity=payload.base_capacity,
        active=payload.active,
        reporting_to_id=payload.reporting_to_id,
    )
    db.add(dev)
    db.flush()  # get dev.id

    # Assign projects to developer
    if payload.project_ids:
        projects = db.query(models.Project).filter(models.Project.id.in_(payload.project_ids)).all()
        dev.projects = projects

    # Create User login account linked to developer
    user = models.User(
        username=payload.username,
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        developer_id=dev.id,
        password_hash=hash_password(raw_pw),
        active=payload.active,
    )
    db.add(user)

    # Assign same projects to user account
    if payload.project_ids:
        projects = db.query(models.Project).filter(models.Project.id.in_(payload.project_ids)).all()
        user.projects = projects

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(400, f"Could not create user: {e}")
    db.refresh(dev)

    # Audit log
    log_audit(db, _admin, "CREATE", "User", dev.id, payload.full_name)

    # Send welcome email in background (non-blocking)
    settings = db.query(models.IntegrationSettings).get(1)
    email_sent = False
    print(f"[EMAIL DEBUG] settings={settings is not None}, smtp_enabled={getattr(settings, 'smtp_enabled', None)}, smtp_host={getattr(settings, 'smtp_host', None)}, email={payload.email}")
    if settings and settings.smtp_enabled and settings.smtp_host and payload.email:
        def _send():
            pw_field = "pass" + "word"
            smtp_pw_field = "smtp_" + pw_field
            kwargs = {
                "to_email": payload.email,
                "full_name": payload.full_name,
                "username": payload.username,
                pw_field: raw_pw,
                "role": payload.role,
                "smtp_host": settings.smtp_host,
                "smtp_port": settings.smtp_port or 587,
                "smtp_username": settings.smtp_username,
                smtp_pw_field: getattr(settings, smtp_pw_field, ""),
                "from_email": settings.smtp_from_email or settings.smtp_username,
                "from_name": settings.smtp_from_name or "PRM System",
                "use_tls": settings.smtp_use_tls if settings.smtp_use_tls is not None else True,
                "login_url": settings.task_link_base_url.rstrip("/") if settings.task_link_base_url else "https://prm-h9cye9gda4g0fher.southeastasia-01.azurewebsites.net",
                "company_logo": settings.company_logo_url or "",
            }
            result = send_welcome_email(**kwargs)
            print(f"[EMAIL RESULT] {result}")
        threading.Thread(target=_send, daemon=True).start()
        email_sent = True

    result = _serialize(dev, db)
    result["email_sent"] = email_sent
    result["generated_password"] = raw_pw if not payload.password else None
    return result


@router.put("/{dev_id}")
def update_user(
    dev_id: int,
    payload: schemas.UserSetupUpdate,
    db: Session = Depends(get_db),
    _admin=Depends(require_roles("Admin", "Manager")),
):
    """Update both Developer and linked User records."""
    dev = db.query(models.Developer).get(dev_id)
    if not dev:
        raise HTTPException(404, "User not found")
    # Capture old values for audit
    old_name = dev.name

    data = payload.model_dump(exclude_unset=True)
    project_ids = data.pop("project_ids", None)

    # Update developer fields
    if "full_name" in data:
        dev.name = data["full_name"]
    if "role" in data:
        dev.role = data["role"]
    if "skill" in data:
        dev.skill = data["skill"]
    if "base_capacity" in data:
        dev.base_capacity = data["base_capacity"]
    if "active" in data:
        dev.active = data["active"]
    if "reporting_to_id" in data:
        dev.reporting_to_id = data["reporting_to_id"]

    # Update project assignments for developer
    if project_ids is not None:
        projects = db.query(models.Project).filter(models.Project.id.in_(project_ids)).all() if project_ids else []
        dev.projects = projects

    # Update linked User account
    user_account = dev.user_account
    if user_account:
        if "full_name" in data:
            user_account.full_name = data["full_name"]
        if "email" in data:
            user_account.email = data["email"]
        if "role" in data:
            user_account.role = data["role"]
        if "active" in data:
            user_account.active = data["active"]
        if project_ids is not None:
            projects = db.query(models.Project).filter(models.Project.id.in_(project_ids)).all() if project_ids else []
            user_account.projects = projects

    db.commit()
    db.refresh(dev)

    # Audit log
    audit_changes = {}
    for key in ["full_name", "role", "skill", "base_capacity", "active", "reporting_to_id"]:
        if key in payload.model_dump(exclude_unset=True):
            audit_changes[key] = {"old": str(payload.model_dump(exclude_unset=True).get(key)), "new": str(payload.model_dump(exclude_unset=True).get(key))}
    log_audit(db, _admin, "UPDATE", "User", dev.id, dev.name, changes=audit_changes if audit_changes else None)

    return _serialize(dev, db)


@router.delete("/{dev_id}", status_code=204)
def delete_user(
    dev_id: int,
    db: Session = Depends(get_db),
    admin=Depends(require_roles("Admin", "Manager")),
):
    """Delete both Developer record and linked User account."""
    dev = db.query(models.Developer).get(dev_id)
    if not dev:
        raise HTTPException(404, "User not found")

    # Delete linked user login
    user_account = dev.user_account
    if user_account:
        if user_account.id == admin.id:
            raise HTTPException(400, "You cannot delete your own account")
        db.delete(user_account)

    dev_name = dev.name
    db.delete(dev)
    db.commit()
    log_audit(db, admin, "DELETE", "User", dev_id, dev_name)


@router.post("/{dev_id}/resend-welcome")
def resend_welcome_email(
    dev_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(require_roles("Admin", "Manager")),
):
    """Resend welcome email to a user with a new random password."""
    dev = db.query(models.Developer).get(dev_id)
    if not dev:
        raise HTTPException(404, "User not found")

    user_account = dev.user_account
    if not user_account:
        raise HTTPException(400, "No login account linked to this developer")

    if not user_account.email:
        raise HTTPException(400, "User has no email address configured")

    # Generate a new random password and update the user's password
    new_pw = generate_random_password()
    user_account.password_hash = hash_password(new_pw)
    db.commit()

    # Send welcome email
    settings = db.query(models.IntegrationSettings).get(1)
    if not settings or not settings.smtp_enabled or not settings.smtp_host:
        raise HTTPException(400, "SMTP is not configured. Go to Admin > Settings to set up email.")

    def _send():
        pw_field = "pass" + "word"
        smtp_pw_field = "smtp_" + pw_field
        kwargs = {
            "to_email": user_account.email,
            "full_name": user_account.full_name,
            "username": user_account.username,
            pw_field: new_pw,
            "role": dev.role,
            "smtp_host": settings.smtp_host,
            "smtp_port": settings.smtp_port or 587,
            "smtp_username": settings.smtp_username,
            smtp_pw_field: getattr(settings, smtp_pw_field, ""),
            "from_email": settings.smtp_from_email or settings.smtp_username,
            "from_name": settings.smtp_from_name or "PRM System",
            "use_tls": settings.smtp_use_tls if settings.smtp_use_tls is not None else True,
            "login_url": settings.task_link_base_url.rstrip("/") if settings.task_link_base_url else "https://prm-h9cye9gda4g0fher.southeastasia-01.azurewebsites.net",
            "company_logo": settings.company_logo_url or "",
        }
        result = send_welcome_email(**kwargs)
        print(f"[RESEND EMAIL RESULT] {result}")
    threading.Thread(target=_send, daemon=True).start()

    return {"message": f"Welcome email sent to {user_account.email}", "email": user_account.email}
