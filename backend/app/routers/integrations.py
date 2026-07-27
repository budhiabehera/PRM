from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_roles
from ..integrations import teams, salesforce

router = APIRouter(prefix="/api/integrations", tags=["Integrations"])


def _get_or_create_settings(db: Session) -> models.IntegrationSettings:
    settings = db.query(models.IntegrationSettings).get(1)
    if not settings:
        settings = models.IntegrationSettings(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.get("/settings", response_model=schemas.IntegrationSettingsOut)
def get_settings(db: Session = Depends(get_db), _admin=Depends(require_roles("Admin"))):
    return _get_or_create_settings(db)


@router.put("/settings", response_model=schemas.IntegrationSettingsOut)
def update_settings(
    payload: schemas.IntegrationSettingsIn,
    db: Session = Depends(get_db),
    _admin=Depends(require_roles("Admin")),
):
    settings = _get_or_create_settings(db)
    for key, value in payload.model_dump().items():
        setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return settings


@router.post("/teams/test")
def test_teams(db: Session = Depends(get_db), _user=Depends(require_roles("Admin", "Manager"))):
    settings = _get_or_create_settings(db)
    success, message = teams.send_teams_message(
        settings.teams_webhook_url,
        "PRM Test Notification",
        "This is a test message from Project & Resource Management (PRM). If you can see this, the Teams integration is working.",
    )
    if not success:
        raise HTTPException(400, message)
    return {"success": True, "message": message}


@router.post("/salesforce/test")
def test_salesforce(db: Session = Depends(get_db), _user=Depends(require_roles("Admin", "Manager"))):
    settings = _get_or_create_settings(db)
    success, message = salesforce.test_connection(settings)
    if not success:
        raise HTTPException(400, message)
    return {"success": True, "message": message}


@router.post("/tasks/{task_id}/notify-teams")
def notify_teams_for_task(
    task_id: int,
    db: Session = Depends(get_db),
    _user=Depends(require_roles("Admin", "Manager", "Lead")),
):
    task = db.query(models.Task).get(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    settings = _get_or_create_settings(db)
    if not settings.teams_enabled:
        raise HTTPException(400, "Teams integration is not enabled. Configure it in Admin > Settings first.")
    success, message = teams.notify_task_event(settings.teams_webhook_url, "update", task)
    if not success:
        raise HTTPException(400, message)
    return {"success": True, "message": message}


@router.post("/tasks/{task_id}/sync-salesforce")
def sync_task_to_salesforce(
    task_id: int,
    db: Session = Depends(get_db),
    _user=Depends(require_roles("Admin", "Manager", "Lead")),
):
    task = db.query(models.Task).get(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    settings = _get_or_create_settings(db)
    if not settings.salesforce_enabled:
        raise HTTPException(400, "Salesforce integration is not enabled. Configure it in Admin > Settings first.")
    success, result = salesforce.push_task_as_case(settings, task)
    if not success:
        raise HTTPException(400, result)
    # Stash the created Salesforce Case Id in its own column — separate from
    # case_ref, which may hold an unrelated internal case number the user typed in.
    task.salesforce_case_id = result
    db.commit()
    return {"success": True, "salesforce_case_id": result}
