"""
Proportional hour allocation for cross-month tasks.

When a task spans multiple months (e.g. Aug 1 → Sep 30, 72 estimated hours),
instead of counting all hours in a single sprint, we distribute proportionally
based on working-day overlap between the task date range and each month/sprint.

Formula:
    task_days_in_period = count_working_days(max(task_start, period_start), min(task_end, period_end))
    total_task_days     = count_working_days(task_start, task_end)
    period_allocation   = estimated_hours × (task_days_in_period / total_task_days)
"""

from datetime import date, timedelta
import calendar
from typing import Optional


def count_working_days(
    start_date: Optional[date],
    end_date: Optional[date],
    holidays: Optional[set] = None,
) -> int:
    """Count weekdays (Mon-Fri) between start and end (inclusive), excluding holidays.

    Edge cases:
      - None dates → 0
      - end before start → 0
      - same day, weekday → 1
      - same day, weekend → 0
    """
    if not start_date or not end_date or end_date < start_date:
        return 0
    if holidays is None:
        holidays = set()
    count = 0
    current = start_date
    while current <= end_date:
        if current.weekday() < 5 and current not in holidays:
            count += 1
        current += timedelta(days=1)
    return count


def allocate_hours_to_period(
    task_start: Optional[date],
    task_end: Optional[date],
    estimated_hours: float,
    period_start: date,
    period_end: date,
    holidays: Optional[set] = None,
) -> float:
    """Return the proportional estimated_hours for a given period.

    If the task has no start/end date, or doesn't overlap the period, returns 0.
    If the task fits entirely within the period, returns the full estimated_hours.
    """
    if not task_start or not task_end or not estimated_hours:
        return 0.0

    # Clamp to the overlap window
    overlap_start = max(task_start, period_start)
    overlap_end = min(task_end, period_end)
    if overlap_start > overlap_end:
        return 0.0  # no overlap

    total_days = count_working_days(task_start, task_end, holidays)
    if total_days == 0:
        return 0.0

    period_days = count_working_days(overlap_start, overlap_end, holidays)
    return round(estimated_hours * (period_days / total_days), 2)


def allocate_task_hours_by_month(
    task_start: Optional[date],
    task_end: Optional[date],
    estimated_hours: float,
    holidays: Optional[set] = None,
) -> dict:
    """Return a dict of {(year, month): hours} showing how hours split across months.

    Example: task Aug 1 → Sep 30, 72h → {(2026, 8): 36.0, (2026, 9): 36.0}
    (assuming equal working days in each month).
    """
    if not task_start or not task_end or not estimated_hours or task_end < task_start:
        return {}

    total_days = count_working_days(task_start, task_end, holidays)
    if total_days == 0:
        return {}

    result = {}
    # Walk month by month
    cur_year, cur_month = task_start.year, task_start.month
    end_year, end_month = task_end.year, task_end.month

    while (cur_year, cur_month) <= (end_year, end_month):
        month_start = date(cur_year, cur_month, 1)
        last_day = calendar.monthrange(cur_year, cur_month)[1]
        month_end = date(cur_year, cur_month, last_day)

        overlap_start = max(task_start, month_start)
        overlap_end = min(task_end, month_end)
        period_days = count_working_days(overlap_start, overlap_end, holidays)

        if period_days > 0:
            result[(cur_year, cur_month)] = round(
                estimated_hours * (period_days / total_days), 2
            )

        # Advance to next month
        if cur_month == 12:
            cur_year += 1
            cur_month = 1
        else:
            cur_month += 1

    return result


def get_holiday_set(db, start_date: Optional[date] = None, end_date: Optional[date] = None) -> set:
    """Fetch holiday dates from DB, optionally filtered to a date range."""
    from ..models import Holiday
    q = db.query(Holiday.date)
    if start_date:
        q = q.filter(Holiday.date >= start_date)
    if end_date:
        q = q.filter(Holiday.date <= end_date)
    return {h[0] for h in q.all()}


def get_proportional_hours_for_sprint(
    task, sprint, holidays: Optional[set] = None
) -> float:
    """Get proportional hours a task contributes to a specific sprint.

    Falls back to full estimated_hours if the task has no date range
    (i.e. current behaviour preserved).
    """
    if not task.start_date or not task.end_date:
        # No date range — fall back: count full hours in assigned sprint
        if task.sprint_id == sprint.id:
            return task.estimated_hours or 0.0
        return 0.0

    # Task has dates — if it's NOT cross-month, just return full hours in its sprint
    if not task.is_cross_month:
        if task.sprint_id == sprint.id:
            return task.estimated_hours or 0.0
        return 0.0

    # Cross-month task: proportional allocation
    return allocate_hours_to_period(
        task.start_date,
        task.end_date,
        task.estimated_hours or 0.0,
        sprint.start_date,
        sprint.end_date,
        holidays,
    )


def compute_hour_split_display(task, holidays: Optional[set] = None) -> Optional[dict]:
    """For a cross-month task, return a display-friendly hour split.

    Returns None if not cross-month.
    Returns dict like: {"is_cross_month": true, "splits": [{"month": "Aug 2026", "hours": 36.0}, ...]}
    """
    if not task.start_date or not task.end_date or not task.is_cross_month:
        return None

    month_hours = allocate_task_hours_by_month(
        task.start_date, task.end_date, task.estimated_hours or 0.0, holidays
    )
    if not month_hours:
        return None

    splits = []
    for (year, month), hours in sorted(month_hours.items()):
        month_name = calendar.month_abbr[month]
        splits.append({
            "month": f"{month_name} {year}",
            "month_short": f"{month_name}",
            "year": year,
            "month_num": month,
            "hours": hours,
        })

    return {"is_cross_month": True, "splits": splits}
