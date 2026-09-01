"""
Daily Hours Check Service — checks if developers have logged sufficient hours
each day and sends email reminders to those under the threshold.

Runs daily at 10 PM IST (UTC+5:30) via background scheduler or external cron.
Checks every day including weekends. Skips holidays and developers on leave.
"""

from datetime import date, datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import func, and_, or_
from sqlalchemy.orm import Session

from .. import models
from ..integrations.email_service import send_hours_reminder_email

# IST timezone
IST = timezone(timedelta(hours=5, minutes=30))

MIN_HOURS = 8  # minimum expected daily hours


def get_today_ist() -> date:
    """Return today's date in IST."""
    return datetime.now(IST).date()


def get_developer_hours_today(db: Session, developer_id: int, check_date: date) -> dict:
    """
    Get a developer's total logged hours for a specific date.
    Combines hours from PRM_time_logs and PRM_task_activities.hours_spent.

    Returns dict with developer info, hours breakdown, and task details.
    """
    # --- Get developer info ---
    developer = db.query(models.Developer).filter(
        models.Developer.id == developer_id
    ).first()
    if not developer:
        return None

    # Get email from linked User account
    email = None
    if developer.user_account:
        email = developer.user_account.email

    # --- Sum hours from PRM_time_logs ---
    time_log_result = db.query(
        func.coalesce(func.sum(models.TimeLog.hours), 0.0)
    ).filter(
        models.TimeLog.developer_id == developer_id,
        models.TimeLog.date == check_date,
    ).scalar()
    time_log_hours = float(time_log_result or 0.0)

    # --- Sum hours from PRM_task_activities ---
    activity_result = db.query(
        func.coalesce(func.sum(models.TaskActivity.hours_spent), 0.0)
    ).filter(
        models.TaskActivity.developer_id == developer_id,
        models.TaskActivity.activity_date == check_date,
    ).scalar()
    activity_log_hours = float(activity_result or 0.0)

    total_hours = round(time_log_hours + activity_log_hours, 2)

    # --- Task breakdown from time_logs ---
    tl_breakdown = (
        db.query(
            models.TimeLog.task_id,
            models.Task.task_code,
            models.Task.description,
            func.sum(models.TimeLog.hours).label("hours"),
        )
        .join(models.Task, models.TimeLog.task_id == models.Task.id)
        .filter(
            models.TimeLog.developer_id == developer_id,
            models.TimeLog.date == check_date,
        )
        .group_by(models.TimeLog.task_id, models.Task.task_code, models.Task.description)
        .all()
    )

    # --- Task breakdown from task_activities ---
    ta_breakdown = (
        db.query(
            models.TaskActivity.task_id,
            models.Task.task_code,
            models.Task.description,
            func.sum(models.TaskActivity.hours_spent).label("hours"),
        )
        .join(models.Task, models.TaskActivity.task_id == models.Task.id)
        .filter(
            models.TaskActivity.developer_id == developer_id,
            models.TaskActivity.activity_date == check_date,
        )
        .group_by(models.TaskActivity.task_id, models.Task.task_code, models.Task.description)
        .all()
    )

    # --- Merge breakdowns (combine by task_id) ---
    task_map = {}
    for row in tl_breakdown:
        tid = row.task_id
        task_map[tid] = {
            "task_code": row.task_code,
            "description": (row.description or "")[:100],
            "hours": float(row.hours or 0),
        }
    for row in ta_breakdown:
        tid = row.task_id
        if tid in task_map:
            task_map[tid]["hours"] = round(task_map[tid]["hours"] + float(row.hours or 0), 2)
        else:
            task_map[tid] = {
                "task_code": row.task_code,
                "description": (row.description or "")[:100],
                "hours": float(row.hours or 0),
            }

    task_breakdown = list(task_map.values())
    task_breakdown.sort(key=lambda x: x["task_code"])

    return {
        "developer_id": developer_id,
        "developer_name": developer.name,
        "email": email,
        "time_log_hours": round(time_log_hours, 2),
        "activity_hours": round(activity_log_hours, 2),
        "total_hours": total_hours,
        "task_breakdown": task_breakdown,
    }


def is_developer_on_leave(db: Session, developer_id: int, check_date: date) -> bool:
    """
    Check if a developer has leave on the given date.
    Looks at PRM_availabilities where start_date <= check_date <= end_date.
    """
    leave_record = db.query(models.Availability).filter(
        models.Availability.developer_id == developer_id,
        models.Availability.start_date <= check_date,
        models.Availability.end_date >= check_date,
    ).first()
    return leave_record is not None


def is_holiday(db: Session, check_date: date) -> tuple[bool, Optional[str]]:
    """
    Check if the given date is a company holiday.
    Returns (is_holiday, holiday_name).
    """
    holiday = db.query(models.Holiday).filter(
        models.Holiday.date == check_date
    ).first()
    if holiday:
        return True, holiday.name
    return False, None


def get_development_manager_email(db: Session, developer_id: int) -> Optional[str]:
    """
    Find the Development Manager / Manager email for a developer's projects.

    Strategy:
    1. Find projects the developer is assigned to (via developer_projects).
    2. Find Users with role "Manager" who have access to those projects (via user_projects).
    3. Fallback: developer's reporting_to chain.
    4. Final fallback: any Admin user's email.
    """
    # Get the developer's project IDs
    developer = db.query(models.Developer).filter(
        models.Developer.id == developer_id
    ).first()
    if not developer:
        return None

    project_ids = [p.id for p in developer.projects]

    if project_ids:
        # Find a Manager user assigned to any of these projects
        manager_user = (
            db.query(models.User)
            .join(models.user_projects, models.User.id == models.user_projects.c.user_id)
            .filter(
                models.user_projects.c.project_id.in_(project_ids),
                models.User.role.in_(["Manager", "Admin"]),
                models.User.active == True,
                models.User.email.isnot(None),
                models.User.email != "",
            )
            .first()
        )
        if manager_user and manager_user.email:
            return manager_user.email

    # Fallback: reporting_to chain
    if developer.reporting_to_id:
        reporting_dev = db.query(models.Developer).filter(
            models.Developer.id == developer.reporting_to_id
        ).first()
        if reporting_dev and reporting_dev.user_account and reporting_dev.user_account.email:
            return reporting_dev.user_account.email

    # Final fallback: any Admin user
    admin_user = db.query(models.User).filter(
        models.User.role == "Admin",
        models.User.active == True,
        models.User.email.isnot(None),
        models.User.email != "",
    ).first()
    if admin_user:
        return admin_user.email

    return None


def _get_smtp_settings(db: Session) -> Optional[dict]:
    """Fetch SMTP settings from IntegrationSettings (id=1)."""
    settings = db.query(models.IntegrationSettings).filter(
        models.IntegrationSettings.id == 1
    ).first()
    if not settings or not settings.smtp_enabled:
        return None
    return {
        "smtp_host": settings.smtp_host,
        "smtp_port": settings.smtp_port,
        "smtp_username": settings.smtp_username,
        "smtp_password": settings.smtp_password,
        "from_email": settings.smtp_from_email,
        "from_name": settings.smtp_from_name or "PRM System",
        "use_tls": settings.smtp_use_tls,
        "task_link_base_url": settings.task_link_base_url or "http://localhost:5173/tasks/",
        "company_logo_url": settings.company_logo_url or "",
    }


def run_daily_hours_check(db: Session, check_date: date = None) -> dict:
    """
    Main function: check all active developers' hours for the day.
    Sends email reminders to developers who logged < 8 hours.

    Runs every day including weekends. Skips if:
    - Today is a company holiday
    - Developer is on leave

    Returns summary dict.
    """
    if check_date is None:
        check_date = get_today_ist()

    result = {
        "date": str(check_date),
        "checked": 0,
        "under_hours": 0,
        "on_leave": 0,
        "emails_sent": 0,
        "emails_failed": 0,
        "skipped": None,
        "holiday_name": None,
        "details": [],
    }

    # --- Check if today is a holiday ---
    holiday_flag, holiday_name = is_holiday(db, check_date)
    if holiday_flag:
        result["skipped"] = "holiday"
        result["holiday_name"] = holiday_name
        return result

    # --- Get active developers from projects with hours_check_enabled ---
    # Only check developers assigned to projects that have hours_check enabled
    enabled_project_ids = [
        p.id for p in db.query(models.Project.id).filter(
            models.Project.hours_check_enabled == True
        ).all()
    ]
    if not enabled_project_ids:
        result["skipped"] = "no_projects_enabled"
        return result

    developers = db.query(models.Developer).filter(
        models.Developer.active == True,
        models.Developer.projects.any(models.Project.id.in_(enabled_project_ids)),
    ).all()

    # --- Get SMTP settings ---
    smtp = _get_smtp_settings(db)

    for dev in developers:
        result["checked"] += 1
        detail = {
            "developer_id": dev.id,
            "developer_name": dev.name,
            "status": "ok",
            "total_hours": 0,
            "on_leave": False,
            "email_sent": False,
        }

        # Check if on leave
        if is_developer_on_leave(db, dev.id, check_date):
            result["on_leave"] += 1
            detail["status"] = "on_leave"
            detail["on_leave"] = True
            result["details"].append(detail)
            continue

        # Get hours for today
        hours_data = get_developer_hours_today(db, dev.id, check_date)
        if not hours_data:
            result["details"].append(detail)
            continue

        detail["total_hours"] = hours_data["total_hours"]
        detail["time_log_hours"] = hours_data["time_log_hours"]
        detail["activity_hours"] = hours_data["activity_hours"]

        if hours_data["total_hours"] >= MIN_HOURS:
            detail["status"] = "ok"
            result["details"].append(detail)
            continue

        # Under hours — send email
        result["under_hours"] += 1
        detail["status"] = "under_hours"

        if smtp and hours_data["email"]:
            cc_email = get_development_manager_email(db, dev.id)
            try:
                success, msg = send_hours_reminder_email(
                    to_email=hours_data["email"],
                    cc_email=cc_email,
                    developer_name=hours_data["developer_name"],
                    check_date=str(check_date),
                    total_hours=hours_data["total_hours"],
                    task_breakdown=hours_data["task_breakdown"],
                    min_hours=MIN_HOURS,
                    smtp_host=smtp["smtp_host"],
                    smtp_port=smtp["smtp_port"],
                    smtp_username=smtp["smtp_username"],
                    smtp_password=smtp["smtp_password"],
                    from_email=smtp["from_email"],
                    from_name=smtp["from_name"],
                    use_tls=smtp["use_tls"],
                    company_logo_url=smtp["company_logo_url"],
                )
                if success:
                    result["emails_sent"] += 1
                    detail["email_sent"] = True
                    detail["email_message"] = msg
                else:
                    result["emails_failed"] += 1
                    detail["email_message"] = msg
            except Exception as e:
                result["emails_failed"] += 1
                detail["email_message"] = f"Error: {e}"
        else:
            detail["email_message"] = "SMTP not configured or no developer email"

        result["details"].append(detail)

    return result


def get_all_developers_daily_summary(db: Session, check_date: date, current_user=None) -> dict:
    """
    OPTIMIZED: Get hours summary for developers using batch queries (2-3 total).
    Replaces the old N+1 pattern that ran 5 queries per developer.
    """
    holiday_flag, holiday_name = is_holiday(db, check_date)

    EXCLUDED_ROLES = {
        "svp product", "svp-product", "avp product", "avp-product",
        "product manager", "product-manager",
    }

    # --- 1. Get developers in ONE query (with user_account for email) ---
    from sqlalchemy.orm import joinedload as jl
    dev_query = db.query(models.Developer).options(
        jl(models.Developer.user_account)
    ).filter(models.Developer.active == True)

    if current_user:
        user_role = (current_user.role or "").strip()
        if user_role == "Admin":
            pass
        elif user_role == "Developer":
            if current_user.developer_id:
                dev_query = dev_query.filter(models.Developer.id == current_user.developer_id)
            else:
                return {"date": str(check_date), "is_holiday": holiday_flag,
                        "holiday_name": holiday_name, "developers": []}
        else:
            user_project_ids = [p.id for p in current_user.projects] if current_user.projects else []
            if user_project_ids:
                dev_query = dev_query.filter(
                    models.Developer.projects.any(models.Project.id.in_(user_project_ids))
                )
            elif current_user.developer_id:
                dev_query = dev_query.filter(models.Developer.id == current_user.developer_id)

    developers = dev_query.order_by(models.Developer.name).all()
    developers = [d for d in developers if not d.role or d.role.strip().lower() not in EXCLUDED_ROLES]

    if not developers:
        return {"date": str(check_date), "is_holiday": holiday_flag,
                "holiday_name": holiday_name, "developers": []}

    dev_ids = [d.id for d in developers]

    # --- 2. Batch: SUM hours from time_logs for ALL developers in ONE query ---
    tl_hours = dict(
        db.query(
            models.TimeLog.developer_id,
            func.coalesce(func.sum(models.TimeLog.hours), 0.0),
        )
        .filter(models.TimeLog.developer_id.in_(dev_ids), models.TimeLog.date == check_date)
        .group_by(models.TimeLog.developer_id)
        .all()
    )

    # --- 3. Batch: SUM hours from task_activities for ALL developers in ONE query ---
    act_hours = dict(
        db.query(
            models.TaskActivity.developer_id,
            func.coalesce(func.sum(models.TaskActivity.hours_spent), 0.0),
        )
        .filter(models.TaskActivity.developer_id.in_(dev_ids), models.TaskActivity.activity_date == check_date)
        .group_by(models.TaskActivity.developer_id)
        .all()
    )

    # --- 4. Batch: check leave for ALL developers (one query) ---
    on_leave_ids = set()
    leave_rows = (
        db.query(models.Availability.developer_id)
        .filter(
            models.Availability.developer_id.in_(dev_ids),
            models.Availability.start_date <= check_date,
            models.Availability.end_date >= check_date,
        )
        .all()
    )
    on_leave_ids = {r.developer_id for r in leave_rows}

    # --- 5. Build response (no more individual queries) ---
    dev_summaries = []
    for dev in developers:
        time_log_h = float(tl_hours.get(dev.id, 0))
        activity_h = float(act_hours.get(dev.id, 0))
        total = round(time_log_h + activity_h, 2)
        on_leave = dev.id in on_leave_ids

        if on_leave:
            status = "on_leave"
        elif holiday_flag:
            status = "holiday"
        elif total >= MIN_HOURS:
            status = "ok"
        else:
            status = "under_hours"

        dev_summaries.append({
            "developer_id": dev.id,
            "developer_name": dev.name,
            "total_hours": total,
            "time_log_hours": time_log_h,
            "activity_hours": activity_h,
            "status": status,
            "on_leave": on_leave,
            "task_breakdown": [],  # skip breakdown for list view (saves queries)
        })

    return {
        "date": str(check_date),
        "is_holiday": holiday_flag,
        "holiday_name": holiday_name,
        "developers": dev_summaries,
    }
