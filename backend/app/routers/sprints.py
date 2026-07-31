from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import models, schemas
from ..database import get_db
from ..deps import require_roles, get_current_user, get_user_project_ids
from ..utils.calculations import net_capacity

router = APIRouter(prefix="/api/sprints", tags=["Sprints"])


def _sprint_with_stats(sprint: models.Sprint, db: Session):
    tasks = sprint.tasks
    alloc_hrs = sum(t.estimated_hours for t in tasks)

    devs = db.query(models.Developer).filter(models.Developer.active == True).all()  # noqa: E712
    total_capacity = 0
    for d in devs:
        leave = (
            db.query(models.Availability)
            .filter(models.Availability.developer_id == d.id, models.Availability.sprint_id == sprint.id)
            .first()
        )
        leave_days = leave.leave_days if leave else 0
        total_capacity += net_capacity(d.base_capacity, leave_days)

    duration = (sprint.end_date - sprint.start_date).days + 1
    util_pct = round((alloc_hrs / total_capacity) * 100, 1) if total_capacity else 0

    return {
        "id": sprint.id,
        "name": sprint.name,
        "project_id": sprint.project_id,
        "project_name": sprint.project.name if sprint.project else None,
        "start_date": sprint.start_date,
        "end_date": sprint.end_date,
        "status": sprint.status,
        "duration_days": duration,
        "task_count": len(tasks),
        "allocated_hours": alloc_hrs,
        "net_capacity": round(total_capacity, 1),
        "utilization_pct": util_pct,
        "tasks_by_project": _tasks_by_project(tasks),
    }


def _tasks_by_project(tasks):
    """Group task count and hours by project_id."""
    result = {}
    for t in tasks:
        pid = str(t.project_id) if t.project_id else "0"
        if pid not in result:
            result[pid] = {"count": 0, "hours": 0}
        result[pid]["count"] += 1
        result[pid]["hours"] += t.estimated_hours
    return result


@router.get("")
def list_sprints(db: Session = Depends(get_db),
                 current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    sq = db.query(models.Sprint)
    # Filter sprints: show only sprints for user's projects or global sprints (no project)
    if allowed is not None:
        sq = sq.filter((models.Sprint.project_id.in_(allowed)) | (models.Sprint.project_id.is_(None)))
    sprints = sq.order_by(models.Sprint.start_date).all()
    results = []
    for s in sprints:
        stats = _sprint_with_stats(s, db)
        # If user has project access restriction, recalculate task stats
        if allowed is not None:
            filtered_tasks = [t for t in s.tasks if t.project_id in allowed]
            stats["task_count"] = len(filtered_tasks)
            stats["allocated_hours"] = sum(t.estimated_hours for t in filtered_tasks)
            stats["utilization_pct"] = round((stats["allocated_hours"] / stats["net_capacity"]) * 100, 1) if stats["net_capacity"] else 0
            stats["tasks_by_project"] = _tasks_by_project(filtered_tasks)
        results.append(stats)
    return results


@router.get("/{sprint_id}")
def get_sprint(sprint_id: int, db: Session = Depends(get_db)):
    sprint = db.query(models.Sprint).get(sprint_id)
    if not sprint:
        raise HTTPException(404, "Sprint not found")
    return _sprint_with_stats(sprint, db)


@router.post("", response_model=schemas.Sprint, status_code=201)
def create_sprint(payload: schemas.SprintCreate, db: Session = Depends(get_db),
                   _user=Depends(require_roles("Admin", "Manager"))):
    if db.query(models.Sprint).filter(models.Sprint.name == payload.name).first():
        raise HTTPException(400, "Sprint already exists")
    sprint = models.Sprint(**payload.model_dump())
    db.add(sprint)
    db.commit()
    db.refresh(sprint)
    return sprint


@router.put("/{sprint_id}", response_model=schemas.Sprint)
def update_sprint(sprint_id: int, payload: schemas.SprintUpdate, db: Session = Depends(get_db),
                   _user=Depends(require_roles("Admin", "Manager"))):
    sprint = db.query(models.Sprint).get(sprint_id)
    if not sprint:
        raise HTTPException(404, "Sprint not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(sprint, key, value)
    db.commit()
    db.refresh(sprint)
    return sprint


@router.delete("/{sprint_id}", status_code=204)
def delete_sprint(sprint_id: int, db: Session = Depends(get_db),
                   _user=Depends(require_roles("Admin", "Manager"))):
    sprint = db.query(models.Sprint).get(sprint_id)
    if not sprint:
        raise HTTPException(404, "Sprint not found")
    db.delete(sprint)
    db.commit()
