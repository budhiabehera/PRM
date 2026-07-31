from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from .. import models
from ..database import get_db
from ..deps import get_current_user, get_user_project_ids

router = APIRouter(prefix="/api/reports", tags=["Reports"])


def _to_row(t: models.Task) -> dict:
    return {
        "id": t.id,
        "task_code": t.task_code,
        "description": t.description,
        "customer": t.property_client or None,
        "case_ref": t.case_ref,
        "product": t.project.name if t.project else None,
        "project_id": t.project_id,
        "main_module": t.main_module.name if t.main_module else None,
        "sub_module": t.sub_module.name if t.sub_module else None,
        "developer": t.developer.name if t.developer else None,
        "developer_id": t.developer_id,
        "work_type": t.work_type.name if t.work_type else None,
        "work_type_id": t.work_type_id,
        "priority": t.priority,
        "status": t.status,
        "customer_committed": t.customer_committed,
        "estimated_hours": t.estimated_hours,
        "actual_hours": t.actual_hours,
        "created_at": t.created_at,
        "created_date": t.created_at.date().isoformat() if t.created_at else None,
        "salesforce_case_id": t.salesforce_case_id,
        "synced_to_salesforce": t.salesforce_case_id is not None,
    }


def _apply_project_access(q, current_user, db):
    """Apply project-based filtering to a Task query."""
    allowed = get_user_project_ids(current_user)
    if allowed is not None:
        q = q.filter(models.Task.project_id.in_(allowed))
    return q, allowed


@router.get("/salesforce-tasks")
def salesforce_tasks_report(
    created_date: date | None = None,
    created_from: date | None = None,
    created_to: date | None = None,
    customer: str | None = None,
    product_id: int | None = None,
    developer_id: int | None = None,
    work_type_id: int | None = None,
    status: str | None = None,
    priority: str | None = None,
    synced: bool | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Task)
    q, _ = _apply_project_access(q, current_user, db)

    if created_date:
        start = datetime.combine(created_date, datetime.min.time())
        end = start + timedelta(days=1)
        q = q.filter(models.Task.created_at >= start, models.Task.created_at < end)
    else:
        if created_from:
            q = q.filter(models.Task.created_at >= datetime.combine(created_from, datetime.min.time()))
        if created_to:
            q = q.filter(models.Task.created_at < datetime.combine(created_to, datetime.min.time()) + timedelta(days=1))

    if customer:
        q = q.filter(models.Task.property_client.ilike(f"%{customer}%"))
    if product_id:
        q = q.filter(models.Task.project_id == product_id)
    if developer_id:
        q = q.filter(models.Task.developer_id == developer_id)
    if work_type_id:
        q = q.filter(models.Task.work_type_id == work_type_id)
    if status:
        q = q.filter(models.Task.status == status)
    if priority:
        q = q.filter(models.Task.priority == priority)
    if synced is not None:
        if synced:
            q = q.filter(models.Task.salesforce_case_id.isnot(None))
        else:
            q = q.filter(models.Task.salesforce_case_id.is_(None))

    tasks = q.order_by(models.Task.created_at.desc()).all()
    rows = [_to_row(t) for t in tasks]

    total_hours = sum(r["estimated_hours"] for r in rows)
    synced_count = sum(1 for r in rows if r["synced_to_salesforce"])

    return {
        "tasks": rows,
        "summary": {
            "total_tasks": len(rows),
            "total_estimated_hours": total_hours,
            "synced_to_salesforce": synced_count,
            "not_synced": len(rows) - synced_count,
        },
    }


@router.get("/customers")
def list_customers(db: Session = Depends(get_db),
                   current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    q = db.query(models.Task.property_client).filter(
        models.Task.property_client.isnot(None), models.Task.property_client != ""
    )
    if allowed is not None:
        q = q.filter(models.Task.project_id.in_(allowed))
    rows = q.distinct().order_by(models.Task.property_client).all()
    return [r[0] for r in rows]


@router.get("/daily-created-counts")
def daily_created_counts(days: int = 14, db: Session = Depends(get_db),
                         current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    since = datetime.combine(date.today() - timedelta(days=days - 1), datetime.min.time())
    q = db.query(func.date(models.Task.created_at).label("day"), func.count(models.Task.id)).filter(
        models.Task.created_at >= since
    )
    if allowed is not None:
        q = q.filter(models.Task.project_id.in_(allowed))
    rows = q.group_by("day").order_by("day").all()
    counts = {day: count for day, count in rows}
    result = []
    for i in range(days):
        d = (date.today() - timedelta(days=days - 1 - i)).isoformat()
        result.append({"date": d, "count": counts.get(d, 0)})
    return result


@router.get("/project-progress")
def project_progress_report(db: Session = Depends(get_db),
                            current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    pq = db.query(models.Project)
    if allowed is not None:
        pq = pq.filter(models.Project.id.in_(allowed))
    projects = pq.order_by(models.Project.name).all()
    rows = []
    for p in projects:
        tasks = p.tasks
        total = len(tasks)
        completed = sum(1 for t in tasks if t.status == "Completed")
        in_progress = sum(1 for t in tasks if t.status == "In Progress")
        not_started = sum(1 for t in tasks if t.status == "Not Started")
        other = total - completed - in_progress - not_started
        est = sum(t.estimated_hours for t in tasks)
        act = sum(t.actual_hours for t in tasks)
        rows.append({
            "project_id": p.id,
            "project": p.name,
            "code": p.code,
            "status": p.status,
            "total_tasks": total,
            "completed": completed,
            "in_progress": in_progress,
            "not_started": not_started,
            "other_status": other,
            "pct_complete": round((completed / total) * 100) if total else 0,
            "estimated_hours": est,
            "actual_hours": act,
            "remaining_hours": max(est - act, 0),
        })
    return rows


@router.get("/overdue-tasks")
def overdue_tasks_report(
    project_id: int | None = None,
    developer_id: int | None = None,
    priority: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    today = date.today()
    q = db.query(models.Task).filter(
        models.Task.end_date.isnot(None),
        models.Task.end_date < today,
        models.Task.status != "Completed",
    )
    q, _ = _apply_project_access(q, current_user, db)
    if project_id:
        q = q.filter(models.Task.project_id == project_id)
    if developer_id:
        q = q.filter(models.Task.developer_id == developer_id)
    if priority:
        q = q.filter(models.Task.priority == priority)

    tasks = q.all()
    rows = []
    for t in tasks:
        row = _to_row(t)
        row["end_date"] = t.end_date.isoformat()
        row["days_overdue"] = (today - t.end_date).days
        rows.append(row)
    rows.sort(key=lambda r: -r["days_overdue"])

    return {
        "tasks": rows,
        "summary": {
            "total_overdue": len(rows),
            "critical_or_high": sum(1 for r in rows if r["priority"] in ("Critical", "High")),
            "avg_days_overdue": round(sum(r["days_overdue"] for r in rows) / len(rows), 1) if rows else 0,
        },
    }


@router.get("/customer-summary")
def customer_summary_report(db: Session = Depends(get_db),
                            current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    q = db.query(models.Task).filter(
        models.Task.property_client.isnot(None), models.Task.property_client != ""
    )
    if allowed is not None:
        q = q.filter(models.Task.project_id.in_(allowed))
    tasks = q.all()

    buckets: dict[str, dict] = {}
    for t in tasks:
        b = buckets.setdefault(t.property_client, {
            "customer": t.property_client,
            "total_tasks": 0,
            "completed": 0,
            "committed_tasks": 0,
            "estimated_hours": 0.0,
            "actual_hours": 0.0,
        })
        b["total_tasks"] += 1
        if t.status == "Completed":
            b["completed"] += 1
        if t.customer_committed:
            b["committed_tasks"] += 1
        b["estimated_hours"] += t.estimated_hours
        b["actual_hours"] += t.actual_hours

    rows = list(buckets.values())
    for r in rows:
        r["pct_complete"] = round((r["completed"] / r["total_tasks"]) * 100) if r["total_tasks"] else 0
    rows.sort(key=lambda r: -r["estimated_hours"])
    return rows


@router.get("/time-variance")
def time_variance_report(
    project_id: int | None = None,
    developer_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    q = db.query(models.Task).filter(models.Task.actual_hours > 0)
    q, _ = _apply_project_access(q, current_user, db)
    if project_id:
        q = q.filter(models.Task.project_id == project_id)
    if developer_id:
        q = q.filter(models.Task.developer_id == developer_id)
    if status:
        q = q.filter(models.Task.status == status)

    tasks = q.all()
    rows = []
    for t in tasks:
        row = _to_row(t)
        variance = t.actual_hours - t.estimated_hours
        row["variance_hours"] = round(variance, 1)
        row["variance_pct"] = round((variance / t.estimated_hours) * 100, 1) if t.estimated_hours else 0
        row["budget_state"] = "over" if variance > 0 else ("under" if variance < 0 else "on-budget")
        rows.append(row)
    rows.sort(key=lambda r: -abs(r["variance_hours"]))

    return {
        "tasks": rows,
        "summary": {
            "total_tasks": len(rows),
            "over_budget": sum(1 for r in rows if r["budget_state"] == "over"),
            "under_budget": sum(1 for r in rows if r["budget_state"] == "under"),
            "on_budget": sum(1 for r in rows if r["budget_state"] == "on-budget"),
            "total_variance_hours": round(sum(r["variance_hours"] for r in rows), 1),
        },
    }
