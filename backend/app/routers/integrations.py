from fastapi import APIRouter, Depends, HTTPException
import requests
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, require_roles
from ..integrations import teams, salesforce, azure_blob

router = APIRouter(prefix="/api/integrations", tags=["Integrations"])

# Anonymous router — no auth required
public_router = APIRouter(prefix="/api/integrations", tags=["Integrations (Public)"])


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
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).get(task_id)
    if not task:
        raise HTTPException(404, "Task not found")

    # Get settings for blob connection, task link, and logo
    settings = _get_or_create_settings(db)

    # Build the task JSON payload
    task_data = {
        "ResourceName": task.developer.name if task.developer else "Unassigned",
        "ResourceEmail": (task.developer.user_account.email if (task.developer and task.developer.user_account and task.developer.user_account.email) else "—"),
        "ProjectName": task.project.name if task.project else "—",
        "SprintName": task.sprint.name if task.sprint else "—",
        "TaskName": task.description,
        "Priority": task.priority or "Medium",
        "AssignedBy": current_user.full_name or current_user.username,
        "DueDate": task.end_date.isoformat() if task.end_date else "—",
        "Tasklink": (settings.task_link_base_url or "http://localhost:5173/tasks/"),
        "CompanyLogo": (settings.company_logo_url or "https://fx1fxposprod.blob.core.windows.net/liaison/PrimaryLogo-TriColour-min.png"),
    }

    # Call Power Automate workflow URL
    workflow_url = settings.teams_webhook_url
    if not workflow_url:
        raise HTTPException(400, "No Teams/Power Automate workflow URL configured. Set it in Admin > Settings > Integrations.")

    try:
        resp = requests.post(workflow_url, json=task_data, timeout=15)
        if resp.status_code not in (200, 202):
            raise HTTPException(400, f"Power Automate returned HTTP {resp.status_code}: {resp.text[:300]}")
    except requests.RequestException as exc:
        raise HTTPException(400, f"Could not reach Power Automate workflow: {exc}")

    return {
        "success": True,
        "message": "Task notification sent to Power Automate workflow",
        "payload": task_data,
    }


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
