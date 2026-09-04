"""Resource Calendar API — shows per-resource daily activity breakdown for a month."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from .. import models
from ..database import get_db
from ..deps import get_current_user, get_visible_developer_ids
from ..deps import get_management_excluded_roles

router = APIRouter(prefix="/api/resource-calendar", tags=["Resource Calendar"])


@router.get("")
def get_resource_calendar(
    year: int = Query(...),
    month: int = Query(...),
    developer_id: int | None = None,
    project_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Returns resource calendar data for a given month.
    Each resource shows their daily task activity with hours spent.
    Base capacity per day: 8 hours.
    """
    # Date range for the month
    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1)
    else:
        end_date = date(year, month + 1, 1)

    # Get developers (optionally filtered by project)
    dev_query = db.query(models.Developer).filter(models.Developer.active == True).filter(models.Developer.role.notin_(get_management_excluded_roles(db)))
    if developer_id:
        dev_query = dev_query.filter(models.Developer.id == developer_id)
    if project_id:
        dev_query = dev_query.join(models.Developer.projects).filter(models.Project.id == project_id)
    # Hierarchy filter: Development Lead sees only direct reports
    if not developer_id:
        visible_ids = get_visible_developer_ids(current_user, db=db)
        if visible_ids is not None:
            dev_query = dev_query.filter(models.Developer.id.in_(visible_ids))
    developers = dev_query.order_by(func.lower(func.ltrim(func.rtrim(models.Developer.name)))).all()

    if not developers:
        return {"resources": [], "month": month, "year": year}

    dev_ids = [d.id for d in developers]

    # Get all task activities for these developers in this month.
    # Include activities where:
    # 1. developer_id matches directly, OR
    # 2. developer_id is NULL but the task is assigned to the developer
    from sqlalchemy import or_
    from sqlalchemy.orm import joinedload
    activities = (
        db.query(models.TaskActivity)
        .options(joinedload(models.TaskActivity.task))
        .join(models.Task, models.TaskActivity.task_id == models.Task.id)
        .filter(
            or_(models.TaskActivity.developer_id.in_(dev_ids), (models.TaskActivity.developer_id == None) & (models.Task.developer_id.in_(dev_ids))),
            models.TaskActivity.activity_date >= start_date,
            models.TaskActivity.activity_date < end_date,
        )
        .all()
    )

    # Get holidays for this month
    holidays = (
        db.query(models.Holiday)
        .filter(models.Holiday.month == month, models.Holiday.year == year)
        .all()
    )
    holiday_dates = {h.date.isoformat(): h.name for h in holidays}

    # Build activity lookup: developer_id -> date -> list of {task_code, description, hours}
    from collections import defaultdict
    activity_map = defaultdict(lambda: defaultdict(list))
    daily_totals = defaultdict(lambda: defaultdict(float))

    for a in activities:
        date_str = a.activity_date.isoformat()
        task = a.task 
        # Determine which developer this activity belongs to
        dev_id = a.developer_id or (task.developer_id if task else None)
        if not dev_id or dev_id not in dev_ids:
            continue
        activity_map[dev_id][date_str].append({
            "task_id": a.task_id,
            "task_code": task.task_code if task else None,
            "description": a.description,
            "hours_spent": a.hours_spent,
        })
        daily_totals[dev_id][date_str] += a.hours_spent

    # Build response
    resources = []
    for dev in developers:
        dev_activities = activity_map.get(dev.id, {})
        dev_totals = daily_totals.get(dev.id, {})

        # Build daily breakdown
        days = {}
        for day_num in range(1, (end_date - start_date).days + 1):
            d = date(year, month, day_num)
            date_str = d.isoformat()
            day_of_week = d.weekday()  # 0=Mon, 6=Sun
            is_weekend = day_of_week >= 5
            is_holiday = date_str in holiday_dates

            total_hours = dev_totals.get(date_str, 0)
            tasks_worked = dev_activities.get(date_str, [])

            days[date_str] = {
                "date": date_str,
                "day": day_num,
                "day_of_week": day_of_week,
                "is_weekend": is_weekend,
                "is_holiday": is_holiday,
                "holiday_name": holiday_dates.get(date_str),
                "total_hours": total_hours,
                "capacity_hours": 0 if (is_weekend or is_holiday) else 8,
                "utilization_pct": round((total_hours / 8) * 100, 1) if not (is_weekend or is_holiday) and total_hours > 0 else 0,
                "tasks": tasks_worked,
            }

        # Monthly summary
        working_days = sum(1 for d in days.values() if not d["is_weekend"] and not d["is_holiday"])
        total_capacity = working_days * 8
        total_spent = sum(d["total_hours"] for d in days.values())

        resources.append({
            "developer_id": dev.id,
            "developer_name": dev.name,
            "role": dev.role,
            "skill": dev.skill,
            "days": days,
            "summary": {
                "working_days": working_days,
                "total_capacity": total_capacity,
                "total_spent": round(total_spent, 1),
                "utilization_pct": round((total_spent / total_capacity) * 100, 1) if total_capacity > 0 else 0,
            },
        })

    return {
        "resources": resources,
        "month": month,
        "year": year,
        "holidays": holiday_dates,
    }
