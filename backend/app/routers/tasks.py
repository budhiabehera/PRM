from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..deps import get_current_user, can_edit_task, can_delete_task, restrict_fields_for_developer

router = APIRouter(prefix="/api/tasks", tags=["Tasks"])


def _to_detail(t: models.Task) -> dict:
    return {
        "id": t.id,
        "task_code": t.task_code,
        "case_ref": t.case_ref,
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
    }


def _generate_task_code(db: Session, sprint: models.Sprint | None) -> str:
    prefix = f"T{sprint.start_date.strftime('%y%m')}" if sprint else "T00000"
    existing = (
        db.query(models.Task)
        .filter(models.Task.task_code.like(f"{prefix}%"))
        .count()
    )
    return f"{prefix}{existing + 1:03d}"


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
):
    q = db.query(models.Task)
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
    tasks = q.order_by(models.Task.task_code).all()
    return [_to_detail(t) for t in tasks]


@router.get("/{task_id}", response_model=schemas.TaskDetail)
def get_task(task_id: int, db: Session = Depends(get_db)):
    t = db.query(models.Task).get(task_id)
    if not t:
        raise HTTPException(404, "Task not found")
    return _to_detail(t)


@router.post("", response_model=schemas.TaskDetail, status_code=201)
def create_task(
    payload: schemas.TaskCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in ("Admin", "Manager", "Lead"):
        raise HTTPException(403, "Developers cannot create or assign new tasks.")
    data = payload.model_dump()
    task_code = data.pop("task_code", None)
    sprint = db.query(models.Sprint).get(data["sprint_id"]) if data.get("sprint_id") else None
    if not task_code:
        task_code = _generate_task_code(db, sprint)
    task = models.Task(task_code=task_code, **data)
    db.add(task)
    db.commit()
    db.refresh(task)
    return _to_detail(task)


@router.put("/{task_id}", response_model=schemas.TaskDetail)
def update_task(
    task_id: int,
    payload: schemas.TaskUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).get(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if not can_edit_task(current_user, task):
        raise HTTPException(403, "You don't have permission to edit this task.")
    update_data = payload.model_dump(exclude_unset=True)
    update_data = restrict_fields_for_developer(current_user, update_data)
    for key, value in update_data.items():
        setattr(task, key, value)
    db.commit()
    db.refresh(task)
    return _to_detail(task)


@router.delete("/{task_id}", status_code=204)
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    task = db.query(models.Task).get(task_id)
    if not task:
        raise HTTPException(404, "Task not found")
    if not can_delete_task(current_user):
        raise HTTPException(403, "You don't have permission to delete tasks.")
    db.delete(task)
    db.commit()
