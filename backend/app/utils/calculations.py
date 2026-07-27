from datetime import date
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


def net_capacity(base_capacity: float, leave_days: float, working_days: int = 22) -> float:
    """Reduce base monthly capacity by leave taken (assumes ~22 working days/month)."""
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
