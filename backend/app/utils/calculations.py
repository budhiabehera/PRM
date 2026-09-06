from datetime import date, timedelta
import calendar


def month_key(d: date) -> str:
    """Returns e.g. 'Jul-2026' for a given date."""
    return f"{calendar.month_abbr[d.month]}-{d.year}"


def utilization_status(pct: float) -> str:
    if pct <= 0:
        return "idle"
    if pct > 100:
        return "over"
    if pct >= 60:
        return "healthy"
    return "under"


def count_working_days(start: date, end: date, holiday_dates: set = None) -> int:
    """Count weekdays (Mon-Fri) between start and end (inclusive), excluding holidays.
    
    Args:
        start: Start date (inclusive)
        end: End date (inclusive)
        holiday_dates: Set of date objects that are holidays. If None, only weekends excluded.
    
    Returns:
        Number of working days
    """
    if not start or not end or end < start:
        return 0
    if holiday_dates is None:
        holiday_dates = set()
    count = 0
    current = start
    while current <= end:
        # weekday(): 0=Mon, 4=Fri, 5=Sat, 6=Sun
        if current.weekday() < 5 and current not in holiday_dates:
            count += 1
        current += timedelta(days=1)
    return count


def get_working_days_for_sprint(sprint_start: date, sprint_end: date, db) -> int:
    """Calculate actual working days for a sprint period by querying holidays from the DB.
    
    Args:
        sprint_start: Sprint start date
        sprint_end: Sprint end date
        db: SQLAlchemy session
    
    Returns:
        Number of working days (weekdays minus holidays)
    """
    from ..models import Holiday
    holidays = (
        db.query(Holiday.date)
        .filter(Holiday.date >= sprint_start, Holiday.date <= sprint_end)
        .all()
    )
    holiday_set = {h[0] for h in holidays}
    return count_working_days(sprint_start, sprint_end, holiday_set)


def net_capacity(base_capacity: float, leave_days: float, working_days: int = 22) -> float:
    """Reduce base monthly capacity by leave taken.
    
    Args:
        base_capacity: Developer's monthly base capacity (e.g. 192 hrs)
        leave_days: Number of leave days taken
        working_days: Actual working days in the month (weekdays - holidays).
                      Pass the result of get_working_days_for_sprint() for accuracy.
    
    Returns:
        Net capacity in hours after deducting leave
    """
    if working_days <= 0:
        return base_capacity
    per_day = base_capacity / working_days
    reduced = base_capacity - (per_day * leave_days)
    return max(reduced, 0)


def task_month_hours(task_estimated_hours: float, start: date, end: date, target_month: str) -> float:
    """Distribute a task's estimated hours evenly across the calendar months it spans,
    returning the portion allocated to `target_month` (e.g. 'Jul-2026')."""
    if not start or not end or end < start:
        return 0
    months = []
    cur = date(start.year, start.month, 1)
    end_marker = date(end.year, end.month, 1)
    while cur <= end_marker:
        months.append(month_key(cur))
        if cur.month == 12:
            cur = date(cur.year + 1, 1, 1)
        else:
            cur = date(cur.year, cur.month + 1, 1)
    if not months:
        return 0
    if target_month not in months:
        return 0
    return task_estimated_hours / len(months)
