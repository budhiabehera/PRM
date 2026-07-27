from datetime import date, datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session
from .. import models
from ..database import get_db

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
):
    """Powers the Admin > Salesforce Tasks page: every task created in PRM,
    filterable by creation date/range, customer, product (project), developer,
    work type, status, priority, and Salesforce-sync state."""
    q = db.query(models.Task)

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
def list_customers(db: Session = Depends(get_db)):
    """Distinct customer/property names, for the Customer filter dropdown."""
    rows = (
        db.query(models.Task.property_client)
        .filter(models.Task.property_client.isnot(None), models.Task.property_client != "")
        .distinct()
        .order_by(models.Task.property_client)
        .all()
    )
    return [r[0] for r in rows]


@router.get("/daily-created-counts")
def daily_created_counts(days: int = 14, db: Session = Depends(get_db)):
    """Task-creation counts per day for the last N days, for a small trend view
    at the top of the Salesforce Tasks page."""
    since = datetime.combine(date.today() - timedelta(days=days - 1), datetime.min.time())
    rows = (
        db.query(func.date(models.Task.created_at).label("day"), func.count(models.Task.id))
        .filter(models.Task.created_at >= since)
        .group_by("day")
        .order_by("day")
        .all()
    )
    counts = {day: count for day, count in rows}
    result = []
    for i in range(days):
        d = (date.today() - timedelta(days=days - 1 - i)).isoformat()
        result.append({"date": d, "count": counts.get(d, 0)})
    return result
