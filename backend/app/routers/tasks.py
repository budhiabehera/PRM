import threading
from fastapi import APIRouter, Depends, HTTPException, Request
import requests as http_requests
from sqlalchemy.orm import Session, joinedload
from .. import models, schemas
from ..database import get_db
from ..database import SessionLocal
from ..services.notification_service import create_notification
from ..deps import get_current_user, can_edit_task, can_delete_task, restrict_fields_for_developer
from ..services.audit_service import log_audit

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


def _get_blocked_by(task: models.Task) -> list[str]:
    """Return list of task_codes that this task depends on and are NOT completed."""
    blocked = []
    for dep in task.dependencies:
        blocking_task = dep.depends_on
        if blocking_task and blocking_task.status != "Completed":
            blocked.append(blocking_task.task_code)
    return blocked


def _to_detail(t: models.Task) -> dict:
    return {
        "id": t.id,
        "task_code": t.task_code,
        "case_ref": t.case_ref,
        "subject": t.subject,
        "point_of_contact": t.point_of_contact,
        "property_client": t.property_client,
        "description": t.description,
        "project_id": t.project_id,
        "main_module_id": t.main_module_id,
        "sub_module_id": t.sub_module_id,
        "developer_id": t.developer_id,
        "work_type_id": t.work_type_id,
        "sprint_id": t.sprint_id,
        "priority": t.priority,
        "status": t.status,
        "customer_committed": t.customer_committed,
        "start_date": t.start_date,
        "end_date": t.end_date,
        "estimated_hours": t.estimated_hours,
        "actual_hours": t.actual_hours,
        "project_name": t.project.name if t.project else None,
        "main_module_name": t.main_module.name if t.main_module else None,
        "sub_module_name": t.sub_module.name if t.sub_module else None,
        "developer_name": t.developer.name if t.developer else None,
        "work_type_name": t.work_type.name if t.work_type else None,
        "sprint_name": t.sprint.name if t.sprint else None,
        "percent_complete": t.percent_complete,
        "is_cross_month": t.is_cross_month,
        "created_at": t.created_at,
        "salesforce_case_id": t.salesforce_case_id,
        "blocked_by": _get_blocked_by(t),
    }


def _generate_task_code(db: Session, sprint: models.Sprint | None) -> str:
    prefix = f"T{sprint.start_date.strftime('%y%m')}" if sprint else "T00000"
    existing = (
        db.query(models.Task)
        .filter(models.Task.task_code.like(f"{prefix}%"))
        .count()
    )
    return f"{prefix}{existing + 1:03d}"


def _notify_teams_async(task_id: int, assigned_by_name: str):
    """Send Teams/Power Automate notification in a background thread after task save."""
    def _send():
        db = SessionLocal()
        try:
            from sqlalchemy.orm import joinedload
            task = db.query(models.Task).options(
                joinedload(models.Task.developer), joinedload(models.Task.project), joinedload(models.Task.sprint)).get(task_id)
            if not task:
                print(f"[TEAMS NOTIFY] Task {task_id} not found, skipping.")
                return
            settings = db.get(models.IntegrationSettings, 1)
            webhook_url = (settings.teams_webhook_url if settings else None)
            if not webhook_url:
                print(f"[TEAMS NOTIFY] No teams_webhook_url configured in IntegrationSettings. Skipping.")
                return

            task_data = {
                "ResourceName": task.developer.name if task.developer else "Unassigned",
                "ResourceEmail": (task.developer.user_account.email if (task.developer and task.developer.user_account and task.developer.user_account.email) else "—"),
                "ProjectName": task.project.name if task.project else "—",
                "SprintName": task.sprint.name if task.sprint else "—",
                "TaskName": task.description,
                "Priority": task.priority or "Medium",
                "AssignedBy": assigned_by_name,
                "DueDate": task.end_date.isoformat() if task.end_date else "—",
                "Tasklink": (settings.task_link_base_url or "http://localhost:5173/tasks/"),
                "CompanyLogo": (settings.company_logo_url or "https://fx1fxposprod.blob.core.windows.net/liaison/PrimaryLogo-TriColour-min.png"),
            }

            resp = http_requests.post(webhook_url, json=task_data, timeout=15)
            print(f"[TEAMS NOTIFY] Sent for task {task_id}, status={resp.status_code}")
        except Exception as e:
            print(f"[TEAMS NOTIFY] Error: {e}")
        finally:
            db.close()
    threading.Thread(target=_send, daemon=True).start()


def _send_task_email_async(task_id: int, assigned_by_name: str):
    """Send email notification to the assigned developer in a background thread."""
    def _send():
        db = SessionLocal()
        try:
            from sqlalchemy.orm import joinedload
            task = db.query(models.Task).options(
                joinedload(models.Task.developer), joinedload(models.Task.project), joinedload(models.Task.sprint)
            ).get(task_id)
            if not task or not task.developer:
                return
            # Get developer's email
            developer = task.developer
            if not developer.user_account or not developer.user_account.email:
                return
            recipient_email = developer.user_account.email

            settings = db.get(models.IntegrationSettings, 1)
            if not settings or not settings.smtp_enabled or not settings.smtp_host:
                return

            from ..integrations.email_service import send_task_assignment_email
            send_task_assignment_email(
                to_email=recipient_email,
                developer_name=developer.name,
                task_code=task.task_code,
                task_description=task.description or "",
                project_name=task.project.name if task.project else "—",
                sprint_name=task.sprint.name if task.sprint else "—",
                priority=task.priority or "Medium",
                due_date=task.end_date.isoformat() if task.end_date else "—",
                assigned_by=assigned_by_name,
                login_url=settings.task_link_base_url.rstrip("/") if settings.task_link_base_url else "https://prm-h9cye9gda4g0fher.southeastasia-01.azurewebsites.net",
                smtp_host=settings.smtp_host,
                smtp_port=settings.smtp_port or 587,
                smtp_username=settings.smtp_username,
                smtp_password=getattr(settings, "smtp_password", ""),
                from_email=settings.smtp_from_email or settings.smtp_username,
                from_name=settings.smtp_from_name or "PRM System",
                use_tls=settings.smtp_use_tls if settings.smtp_use_tls is not None else True,
            )
            print(f"[EMAIL NOTIFY] Sent task assignment email to {recipient_email}")
        except Exception as e:
            print(f"[EMAIL NOTIFY] Error: {e}")
        finally:
            db.close()
    threading.Thread(target=_send, daemon=True).start()


@router.get("", response_model=list[schemas.TaskDetail])
def list_tasks(
    project_id: int | None = None,
    main_module_id: int | None = None,
    sub_module_id: int | None = None,
    developer_id: int | None = None,
    work_type_id: int | None = None,
    sprint_id: int | None = None,
    status: str | None = None,
    priority: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Task).options(
        joinedload(models.Task.project),
        joinedload(models.Task.main_module),
        joinedload(models.Task.sub_module),
        joinedload(models.Task.developer),
        joinedload(models.Task.work_type),
        joinedload(models.Task.sprint),
        joinedload(models.Task.dependencies).joinedload(models.TaskDependency.depends_on),
    )
    # Enforce project-based access
    from ..deps import get_user_project_ids
    allowed_project_ids = get_user_project_ids(current_user)
    if allowed_project_ids is not None:
        q = q.filter(models.Task.project_id.in_(allowed_project_ids))
    if project_id:
        q = q.filter(models.Task.project_id == project_id)
    if main_module_id:
        q = q.filter(models.Task.main_module_id == main_module_id)
    if sub_module_id:
        q = q.filter(models.Task.sub_module_id == sub_module_id)
    if developer_id:
        q = q.filter(models.Task.developer_id == developer_id)
    if work_type_id:
        q = q.filter(models.Task.work_type_id == work_type_id)
    if sprint_id:
        q = q.filter(models.Task.sprint_id == sprint_id)
    if status:
        q = q.filter(models.Task.status == status)
    if priority:
        q = q.filter(models.Task.priority == priority)
    tasks = q.order_by(models.Task.id.desc()).all()
    return [_to_detail(t) for t in tasks]


@router.get("/{task_id}", response_model=schemas.TaskDetail)
def get_task(task_id: int, db: Session = Depends(get_db)):
    t = db.query(models.Task).filter(models.Task.id == task_id).options(
        joinedload(models.Task.project),
        joinedload(models.Task.main_module),
        joinedload(models.Task.sub_module),
        joinedload(models.Task.developer),
        joinedload(models.Task.work_type),
        joinedload(models.Task.sprint),
        joinedload(models.Task.dependencies).joinedload(models.TaskDependency.depends_on),
    ).first()
    if not t:
        raise HTTPException(404, "Task not found")
    return _to_detail(t)


@router.post("", response_model=schemas.TaskDetail, status_code=201)
def create_task(
    payload: schemas.TaskCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Developers can create tasks only assigned to themselves
    if current_user.role == "Developer":
        if not current_user.developer_id:
            raise HTTPException(403, "Your account is not linked to a developer record. Contact your Admin.")
        # Force the task to be assigned to themselves
        payload.developer_id = current_user.developer_id
    data = payload.model_dump()
    data.pop("actual_hours", None)  # auto-calculated from task activities
    task_code = data.pop("task_code", None)
    sprint = db.get(models.Sprint, data["sprint_id"]) if data.get("sprint_id") else None
    if not task_code:
        task_code = _generate_task_code(db, sprint)
    task = models.Task(task_code=task_code, **data)
    db.add(task)

    # Auto-fill reporting_to from org hierarchy
    if task.developer_id and task.project_id and not task.reporting_to_id:
        org_entry = db.query(models.OrgHierarchy).filter(
            models.OrgHierarchy.project_id == task.project_id,
            models.OrgHierarchy.developer_id == task.developer_id,
        ).first()
        if org_entry and org_entry.reports_to_id:
            task.reporting_to_id = org_entry.reports_to_id

    db.commit()
    db.refresh(task)

    # Audit log
    log_audit(db, current_user, "CREATE", "Task", task.id, task.task_code)

    # Email notification only — Teams is triggered manually via "Notify Team" button
    _send_task_email_async(task.id, current_user.full_name or current_user.username)

    # In-app notification: notify assigned developer
    if task.developer_id:
        developer = db.get(models.Developer, task.developer_id)
        if developer and developer.user_account:
            create_notification(
                db=db,
                user_id=developer.user_account.id,
                type="task_assigned",
                title=f"New task assigned: {task.task_code}",
                message=f"You have been assigned task {task.task_code} — {task.description[:100] if task.description else ''}",
                task_id=task.id,
            )

    return _to_detail(task)


@router.put("/{task_id}", response_model=schemas.TaskDetail)
def update_task(
    task_id: int,
    payload: schemas.TaskUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.get(models.Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if not can_edit_task(current_user, task):
        raise HTTPException(403, "You don't have permission to edit this task.")
    update_data = payload.model_dump(exclude_unset=True)
    update_data = restrict_fields_for_developer(current_user, update_data)
    update_data.pop("actual_hours", None)  # actual_hours is auto-calculated from task activities

    # Track old values for notification logic and audit
    old_values = {key: getattr(task, key) for key in update_data}
    old_status = old_values.get("status", task.status)
    old_developer_id = old_values.get("developer_id", task.developer_id)

    for key, value in update_data.items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)

    # Audit log — build changes dict
    changed_fields = {k: {"old": str(old_values[k]) if old_values[k] is not None else None, "new": str(v) if v is not None else None} for k, v in update_data.items() if old_values.get(k) != v}
    if changed_fields:
        log_audit(db, current_user, "UPDATE", "Task", task.id, task.task_code, changes=changed_fields)

    # Email notification only — Teams is triggered manually via "Notify Team" button
    _send_task_email_async(task.id, current_user.full_name or current_user.username)

    # In-app notification: status changed
    new_status = task.status
    if "status" in update_data and old_status != new_status:
        if task.developer_id:
            developer = db.get(models.Developer, task.developer_id)
            if developer and developer.user_account:
                create_notification(
                    db=db,
                    user_id=developer.user_account.id,
                    type="status_changed",
                    title=f"Task {task.task_code} status changed to {new_status}",
                    message=f"Status updated from \"{old_status}\" to \"{new_status}\".",
                    task_id=task.id,
                )

    # In-app notification: reassignment
    if "developer_id" in update_data and old_developer_id != task.developer_id and task.developer_id:
        new_developer = db.get(models.Developer, task.developer_id)
        if new_developer and new_developer.user_account:
            create_notification(
                db=db,
                user_id=new_developer.user_account.id,
                type="task_assigned",
                title=f"Task {task.task_code} has been assigned to you",
                message=f"You have been assigned task {task.task_code} — {task.description[:100] if task.description else ''}",
                task_id=task.id,
            )

    return _to_detail(task)


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.get(models.Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if not can_delete_task(current_user):
        raise HTTPException(403, "You don't have permission to delete tasks.")
    task_code = task.task_code

    # Delete child records first (FK constraints prevent direct task delete)
    # 1. Task activities
    db.query(models.TaskActivity).filter(models.TaskActivity.task_id == task_id).delete(synchronize_session=False)
    # 2. Time logs
    db.query(models.TimeLog).filter(models.TimeLog.task_id == task_id).delete(synchronize_session=False)
    # 3. Task attachments
    db.query(models.TaskAttachment).filter(models.TaskAttachment.task_id == task_id).delete(synchronize_session=False)
    # 4. Task dependencies (both directions)
    db.query(models.TaskDependency).filter(
        (models.TaskDependency.task_id == task_id) | (models.TaskDependency.depends_on_id == task_id)
    ).delete(synchronize_session=False)
    # 5. Notifications linked to this task
    db.query(models.Notification).filter(models.Notification.task_id == task_id).delete(synchronize_session=False)
    # 6. Engineering: unlink commits and PRs (set task_id to NULL, don't delete them)
    db.query(models.Commit).filter(models.Commit.task_id == task_id).update({"task_id": None}, synchronize_session=False)
    db.query(models.PullRequest).filter(models.PullRequest.task_id == task_id).update({"task_id": None}, synchronize_session=False)

    # Now safe to delete the task
    db.delete(task)
    db.commit()
    log_audit(db, current_user, "DELETE", "Task", task_id, task_code)


# ===========================
# Task Dependencies Endpoints
# ===========================

@router.get("/{task_id}/dependencies", response_model=list[schemas.TaskDependencyOut])
def list_task_dependencies(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.get(models.Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    deps = (
        db.query(models.TaskDependency)
        .filter(models.TaskDependency.task_id == task_id)
        .all()
    )
    result = []
    for dep in deps:
        blocking = dep.depends_on
        result.append({
            "id": dep.id,
            "task_id": dep.task_id,
            "depends_on_id": dep.depends_on_id,
            "depends_on_task_code": blocking.task_code if blocking else None,
            "depends_on_description": blocking.description if blocking else None,
            "depends_on_status": blocking.status if blocking else None,
            "created_at": dep.created_at,
        })
    return result


@router.post("/{task_id}/dependencies", response_model=schemas.TaskDependencyOut, status_code=201)
def add_task_dependency(
    task_id: int,
    payload: schemas.TaskDependencyCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.get(models.Task, task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if payload.depends_on_id == task_id:
        raise HTTPException(400, "A task cannot depend on itself")
    blocking = db.get(models.Task, payload.depends_on_id)
    if not blocking:
        raise HTTPException(404, "Depends-on task not found")
    # Check duplicate
    existing = db.query(models.TaskDependency).filter_by(
        task_id=task_id, depends_on_id=payload.depends_on_id
    ).first()
    if existing:
        raise HTTPException(409, "Dependency already exists")
    dep = models.TaskDependency(task_id=task_id, depends_on_id=payload.depends_on_id)
    db.add(dep)
    db.commit()
    db.refresh(dep)
    return {
        "id": dep.id,
        "task_id": dep.task_id,
        "depends_on_id": dep.depends_on_id,
        "depends_on_task_code": blocking.task_code,
        "depends_on_description": blocking.description,
        "depends_on_status": blocking.status,
        "created_at": dep.created_at,
    }


@router.delete("/{task_id}/dependencies/{dep_id}", status_code=204)
def remove_task_dependency(
    task_id: int,
    dep_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    dep = db.query(models.TaskDependency).filter_by(id=dep_id, task_id=task_id).first()
    if not dep:
        raise HTTPException(404, "Dependency not found")
    db.delete(dep)
    db.commit()
