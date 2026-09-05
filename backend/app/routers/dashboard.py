from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, case, and_, or_, literal
import time
from collections import defaultdict
from .. import models
from ..database import get_db
from ..deps import PLANNING_STATUSES, get_current_user, get_user_project_ids
from ..deps import get_management_excluded_roles
from ..utils.calculations import net_capacity
from .sprints import _sprint_with_stats

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


def _filter_tasks(db: Session, developer_id: int | None = None, sprint_id: int | None = None,
                  project_ids: list[int] | None = None, project_id: int | None = None):
    """Base task query filtered by optional developer, sprint, and project access.
    Eagerly loads related objects to avoid N+1 queries over the network."""
    q = db.query(models.Task).options(
        joinedload(models.Task.project),
        joinedload(models.Task.work_type),
        joinedload(models.Task.main_module),
        joinedload(models.Task.sub_module),
        joinedload(models.Task.developer),
    )
    if project_ids is not None:
        q = q.filter(models.Task.project_id.in_(project_ids))
    if project_id:
        q = q.filter(models.Task.project_id == project_id)
    if developer_id:
        q = q.filter(models.Task.developer_id == developer_id)
    if sprint_id:
        q = q.filter(models.Task.sprint_id == sprint_id)
    return q.all()


def _base_task_filter(query, developer_id=None, sprint_id=None, project_ids=None, project_id=None):
    """Apply common task filters to a SQLAlchemy query (for SQL-based aggregation)."""
    if project_ids is not None:
        query = query.filter(models.Task.project_id.in_(project_ids))
    if project_id:
        query = query.filter(models.Task.project_id == project_id)
    if developer_id:
        query = query.filter(models.Task.developer_id == developer_id)
    if sprint_id:
        query = query.filter(models.Task.sprint_id == sprint_id)
    return query


@router.get("/kpis")
def kpis(db: Session = Depends(get_db), developer_id: int | None = None, sprint_id: int | None = None, project_id: int | None = None,
         current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    dev_q = db.query(models.Developer).filter(models.Developer.active == True).filter(models.Developer.role.notin_(get_management_excluded_roles(db)))  # noqa: E712
    if allowed is not None:
        from ..models import developer_projects as dp1
        dev_q = dev_q.filter(models.Developer.id.in_(
            db.query(dp1.c.developer_id).filter(dp1.c.project_id.in_(allowed))
        ))
    if project_id:
        from ..models import developer_projects as dp2
        dev_q = dev_q.filter(models.Developer.id.in_(
            db.query(dp2.c.developer_id).filter(dp2.c.project_id == project_id)
        ))
    total_devs = dev_q.count()
    tasks = _filter_tasks(db, developer_id, sprint_id, allowed, project_id)
    total_hours = sum(t.estimated_hours for t in tasks)
    committed = sum(1 for t in tasks if t.customer_committed)
    cross_month = sum(1 for t in tasks if t.is_cross_month)
    return {
        "total_developers": total_devs if not developer_id else 1,
        "total_tasks": len(tasks),
        "total_estimated_hours": total_hours,
        "customer_committed_tasks": committed,
        "cross_month_tasks": cross_month,
    }


@router.get("/status-breakdown")
def status_breakdown(db: Session = Depends(get_db), developer_id: int | None = None, sprint_id: int | None = None, project_id: int | None = None,
                     current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    tasks = _filter_tasks(db, developer_id, sprint_id, allowed, project_id)
    buckets: dict[str, dict] = {}
    for t in tasks:
        b = buckets.setdefault(t.status, {"status": t.status, "count": 0, "estimated_hours": 0})
        b["count"] += 1
        b["estimated_hours"] += t.estimated_hours
    return sorted(buckets.values(), key=lambda x: -x["count"])


@router.get("/project-breakdown")
def project_breakdown(db: Session = Depends(get_db), developer_id: int | None = None, sprint_id: int | None = None, project_id: int | None = None,
                      current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    tasks = _filter_tasks(db, developer_id, sprint_id, allowed, project_id)
    buckets: dict[str, dict] = {}
    for t in tasks:
        pname = t.project.name if t.project else "Unassigned"
        b = buckets.setdefault(pname, {"project": pname, "tasks": 0, "estimated_hours": 0, "remaining_hours": 0})
        b["tasks"] += 1
        b["estimated_hours"] += t.estimated_hours
        b["remaining_hours"] += max(t.estimated_hours - t.actual_hours, 0)
    return list(buckets.values())


@router.get("/work-type-breakdown")
def work_type_breakdown(db: Session = Depends(get_db), developer_id: int | None = None, sprint_id: int | None = None, project_id: int | None = None,
                        current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    tasks = _filter_tasks(db, developer_id, sprint_id, allowed, project_id)
    buckets: dict[str, dict] = {}
    for t in tasks:
        wt = t.work_type
        if not wt:
            continue
        b = buckets.setdefault(wt.name, {
            "work_type": wt.name,
            "customer_committed": wt.customer_committed,
            "tasks": 0, "estimated_hours": 0, "actual_hours": 0,
        })
        b["tasks"] += 1
        b["estimated_hours"] += t.estimated_hours
        b["actual_hours"] += t.actual_hours
    return list(buckets.values())


@router.get("/module-breakdown")
def module_breakdown(db: Session = Depends(get_db), developer_id: int | None = None, sprint_id: int | None = None, project_id: int | None = None,
                     current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    tasks = _filter_tasks(db, developer_id, sprint_id, allowed, project_id)
    buckets: dict[str, dict] = {}
    for t in tasks:
        mname = t.main_module.name if t.main_module else "Unassigned"
        b = buckets.setdefault(mname, {"module": mname, "developers": 0, "tasks": 0, "estimated_hours": 0})
        b["tasks"] += 1
        b["estimated_hours"] += t.estimated_hours
    # Fill developer counts (batch query instead of per-module)
    all_modules = {m.name: m.id for m in db.query(models.MainModule).all()}
    if all_modules:
        dev_counts = dict(
            db.query(models.Developer.home_module_id, func.count(models.Developer.id))
            .filter(models.Developer.home_module_id.isnot(None))
            .group_by(models.Developer.home_module_id)
            .all()
        )
        for key in buckets:
            mod_id = all_modules.get(key)
            if mod_id:
                buckets[key]["developers"] = dev_counts.get(mod_id, 0)
    return list(buckets.values())


@router.get("/sub-module-breakdown")
def sub_module_breakdown(db: Session = Depends(get_db), developer_id: int | None = None, sprint_id: int | None = None, project_id: int | None = None,
                         current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    tasks = _filter_tasks(db, developer_id, sprint_id, allowed, project_id)
    buckets: dict[str, dict] = {}
    for t in tasks:
        sname = t.sub_module.name if t.sub_module else "Unassigned"
        mname = t.main_module.name if t.main_module else None
        b = buckets.setdefault(sname, {"sub_module": sname, "main_module": mname, "tasks": 0, "estimated_hours": 0})
        b["tasks"] += 1
        b["estimated_hours"] += t.estimated_hours
    return list(buckets.values())


@router.get("/monthly-utilization")
def monthly_utilization(db: Session = Depends(get_db), developer_id: int | None = None, sprint_id: int | None = None, project_id: int | None = None,
                        current_user: models.User = Depends(get_current_user)):
    allowed = get_user_project_ids(current_user)
    sprint_q = db.query(models.Sprint).order_by(models.Sprint.id.asc())
    if sprint_id:
        sprint_q = sprint_q.filter(models.Sprint.id == sprint_id)
    if project_id:
        sprint_q = sprint_q.filter((models.Sprint.project_id == project_id) | (models.Sprint.project_id.is_(None)))
    sprints = sprint_q.all()
    result = []
    dev_q = db.query(models.Developer).options(
        joinedload(models.Developer.tasks),
    ).filter(models.Developer.active == True).filter(models.Developer.role.notin_(get_management_excluded_roles(db)))  # noqa: E712
    if developer_id:
        dev_q = dev_q.filter(models.Developer.id == developer_id)
    # Filter developers to user's projects
    if allowed is not None:
        from ..models import developer_projects
        dev_q = dev_q.filter(models.Developer.id.in_(
            db.query(developer_projects.c.developer_id).filter(developer_projects.c.project_id.in_(allowed))
        ))
    # Filter developers to selected project
    if project_id:
        from ..models import developer_projects as dp
        dev_q = dev_q.filter(models.Developer.id.in_(
            db.query(dp.c.developer_id).filter(dp.c.project_id == project_id)
        ))
    devs = dev_q.all()
    for s in sprints:
        stats = _sprint_with_stats(s, db)
        over = healthy = idle = 0
        total_allocated = 0
        total_capacity = 0
        for d in devs:
            task_filter = [t for t in d.tasks if t.sprint_id == s.id]
            # Apply project access filter
            if allowed is not None:
                task_filter = [t for t in task_filter if t.project_id in allowed]
            if project_id:
                task_filter = [t for t in task_filter if t.project_id == project_id]
            assigned = sum(t.estimated_hours for t in task_filter)
            total_allocated += assigned
            total_capacity += d.base_capacity
            pct = (assigned / d.base_capacity * 100) if d.base_capacity else 0
            if pct <= 0:
                idle += 1
            elif pct > 100:
                over += 1
            elif pct >= 60:
                healthy += 1
        util_pct = round((total_allocated / total_capacity * 100) if total_capacity else 0)
        result.append({
            "month": s.name,
            "allocated_hours": total_allocated if developer_id else stats["allocated_hours"],
            "net_capacity": total_capacity if developer_id else stats["net_capacity"],
            "utilization_pct": util_pct if developer_id else stats["utilization_pct"],
            "over_count": over,
            "healthy_count": healthy,
            "idle_count": idle,
        })
    return result


# ─── Consolidated dashboard endpoint (optimised with SQL aggregation) ───────

@router.get("/all")
def dashboard_all(
    db: Session = Depends(get_db),
    developer_id: int | None = None,
    sprint_id: int | None = None,
    project_id: int | None = None,
    current_user: models.User = Depends(get_current_user),
):
    """Consolidated dashboard — all KPIs + breakdowns in ONE response.

    Uses SQL GROUP BY for all breakdowns (no ORM eager-load).
    Monthly utilization is computed with batched queries (no per-sprint DB hits).
    """
    allowed = get_user_project_ids(current_user)
    excluded_roles = get_management_excluded_roles(db)  # fetch ONCE

    t0 = time.perf_counter()

    # ── Helper: apply common task filters to any query on Task table ──
    def _apply_filters(q):
        if allowed is not None:
            q = q.filter(models.Task.project_id.in_(allowed))
        if project_id:
            q = q.filter(models.Task.project_id == project_id)
        if developer_id:
            q = q.filter(models.Task.developer_id == developer_id)
        if sprint_id:
            q = q.filter(models.Task.sprint_id == sprint_id)
        return q

    # ── 1. KPIs (single SQL query) ──────────────────────────────────
    kpi_q = _apply_filters(

        db.query(
            func.count(models.Task.id).label("total_tasks"),
            func.coalesce(func.sum(models.Task.estimated_hours), 0).label("total_estimated_hours"),
            func.sum(case((models.Task.customer_committed == True, 1), else_=0)).label("committed"),  # noqa: E712
            # is_cross_month: start_date and end_date in different months
            func.sum(case(
                (and_(
                    models.Task.start_date.isnot(None),
                    models.Task.end_date.isnot(None),
                    or_(
                        func.month(models.Task.start_date) != func.month(models.Task.end_date),
                        func.year(models.Task.start_date) != func.year(models.Task.end_date),
                    ),
                ), 1),
                else_=0,
            )).label("cross_month"),
        )
    )
    kpi_row = kpi_q.one()

    # Developer count
    dev_q = db.query(func.count(models.Developer.id)).filter(
        models.Developer.active == True,  # noqa: E712
        models.Developer.role.notin_(excluded_roles),
    )
    if allowed is not None:
        dev_q = dev_q.filter(models.Developer.id.in_(
            db.query(models.developer_projects.c.developer_id).filter(models.developer_projects.c.project_id.in_(allowed))
        ))
    if project_id:
        dev_q = dev_q.filter(models.Developer.id.in_(
            db.query(models.developer_projects.c.developer_id).filter(models.developer_projects.c.project_id == project_id)
        ))
    total_devs = dev_q.scalar() or 0

    kpis_data = {
        "total_developers": 1 if developer_id else total_devs,
        "total_tasks": kpi_row.total_tasks or 0,
        "total_estimated_hours": float(kpi_row.total_estimated_hours or 0),
        "customer_committed_tasks": int(kpi_row.committed or 0),
        "cross_month_tasks": int(kpi_row.cross_month or 0),
    }

    t1 = time.perf_counter()
    print(f"[dashboard/all] KPIs: {(t1 - t0)*1000:.0f}ms")

    # ── 2. Status breakdown (SQL GROUP BY) ──────────────────────────
    status_q = _apply_filters(
        db.query(
            models.Task.status,
            func.count(models.Task.id).label("cnt"),
            func.coalesce(func.sum(models.Task.estimated_hours), 0).label("est"),
        )
    ).group_by(models.Task.status)
    status_breakdown_data = sorted(
        [{"status": r.status or "Unknown", "count": r.cnt, "estimated_hours": float(r.est)} for r in status_q.all()],
        key=lambda x: -x["count"],
    )

    t2 = time.perf_counter()
    print(f"[dashboard/all] Status breakdown: {(t2 - t1)*1000:.0f}ms")

    # ── 3. Project breakdown (SQL GROUP BY + join) ──────────────────
    proj_q = _apply_filters(
        db.query(
            models.Project.name.label("pname"),
            func.count(models.Task.id).label("cnt"),
            func.coalesce(func.sum(models.Task.estimated_hours), 0).label("est"),
            func.coalesce(func.sum(
                case(
                    (models.Task.estimated_hours > models.Task.actual_hours,
                     models.Task.estimated_hours - models.Task.actual_hours),
                    else_=literal(0),
                )
            ), 0).label("remaining"),
        ).outerjoin(models.Project, models.Task.project_id == models.Project.id)
    ).group_by(models.Project.name)
    project_breakdown_data = [
        {"project": r.pname or "Unassigned", "tasks": r.cnt, "estimated_hours": float(r.est), "remaining_hours": float(r.remaining)}
        for r in proj_q.all()
    ]

    t3 = time.perf_counter()
    print(f"[dashboard/all] Project breakdown: {(t3 - t2)*1000:.0f}ms")

    # ── 4. Work-type breakdown (SQL GROUP BY + join) ────────────────
    wt_q = _apply_filters(
        db.query(
            models.WorkType.name.label("wt_name"),
            models.WorkType.customer_committed,
            func.count(models.Task.id).label("cnt"),
            func.coalesce(func.sum(models.Task.estimated_hours), 0).label("est"),
            func.coalesce(func.sum(models.Task.actual_hours), 0).label("act"),
        ).join(models.WorkType, models.Task.work_type_id == models.WorkType.id)
    ).group_by(models.WorkType.name, models.WorkType.customer_committed)
    work_type_breakdown_data = [
        {"work_type": r.wt_name, "customer_committed": r.customer_committed, "tasks": r.cnt,
         "estimated_hours": float(r.est), "actual_hours": float(r.act)}
        for r in wt_q.all()
    ]

    t4 = time.perf_counter()
    print(f"[dashboard/all] Work-type breakdown: {(t4 - t3)*1000:.0f}ms")

    # ── 5. Module breakdown (SQL GROUP BY + join) ───────────────────
    mod_q = _apply_filters(
        db.query(
            models.MainModule.name.label("mod_name"),
            func.count(models.Task.id).label("cnt"),
            func.coalesce(func.sum(models.Task.estimated_hours), 0).label("est"),
        ).outerjoin(models.MainModule, models.Task.main_module_id == models.MainModule.id)
    ).group_by(models.MainModule.name)
    mod_rows = mod_q.all()

    # Developer counts per module (single query)
    dev_count_q = (
        db.query(models.Developer.home_module_id, func.count(models.Developer.id))
        .filter(models.Developer.home_module_id.isnot(None))
        .group_by(models.Developer.home_module_id)
    )
    dev_counts = dict(dev_count_q.all())
    mod_id_map = {m.name: m.id for m in db.query(models.MainModule.id, models.MainModule.name).all()}

    module_breakdown_data = [
        {"module": r.mod_name or "Unassigned", "tasks": r.cnt, "estimated_hours": float(r.est),
         "developers": dev_counts.get(mod_id_map.get(r.mod_name), 0)}
        for r in mod_rows
    ]

    t5 = time.perf_counter()
    print(f"[dashboard/all] Module breakdown: {(t5 - t4)*1000:.0f}ms")

    # ── 6. Sub-module breakdown (SQL GROUP BY + joins) ──────────────
    sub_q = _apply_filters(
        db.query(
            models.SubModule.name.label("sub_name"),
            models.MainModule.name.label("mod_name"),
            func.count(models.Task.id).label("cnt"),
            func.coalesce(func.sum(models.Task.estimated_hours), 0).label("est"),
        )
        .outerjoin(models.SubModule, models.Task.sub_module_id == models.SubModule.id)
        .outerjoin(models.MainModule, models.Task.main_module_id == models.MainModule.id)
    ).group_by(models.SubModule.name, models.MainModule.name)
    sub_module_breakdown_data = [
        {"sub_module": r.sub_name or "Unassigned", "main_module": r.mod_name, "tasks": r.cnt,
         "estimated_hours": float(r.est)}
        for r in sub_q.all()
    ]

    t6 = time.perf_counter()
    print(f"[dashboard/all] Sub-module breakdown: {(t6 - t5)*1000:.0f}ms")

    # ── 7. Monthly utilization (batched — no per-sprint DB hits) ────
    # Fetch sprints
    sprint_q = db.query(models.Sprint).order_by(models.Sprint.id.asc())
    if sprint_id:
        sprint_q = sprint_q.filter(models.Sprint.id == sprint_id)
    if project_id:
        sprint_q = sprint_q.filter((models.Sprint.project_id == project_id) | (models.Sprint.project_id.is_(None)))
    all_sprints = sprint_q.all()

    if not all_sprints:
        monthly_data = []
    else:
        sprint_ids = [s.id for s in all_sprints]

        # Batch: allocated hours per sprint (exclude planning statuses)
        planning_statuses_list = [s.lower().strip() for s in PLANNING_STATUSES]
        alloc_q = (
            db.query(
                models.Task.sprint_id,
                func.coalesce(func.sum(models.Task.estimated_hours), 0).label("alloc"),
            )
            .filter(
                models.Task.sprint_id.in_(sprint_ids),
                func.lower(func.ltrim(func.rtrim(models.Task.status))).notin_(planning_statuses_list),
            )
        )
        if allowed is not None:
            alloc_q = alloc_q.filter(models.Task.project_id.in_(allowed))
        if project_id:
            alloc_q = alloc_q.filter(models.Task.project_id == project_id)
        if developer_id:
            alloc_q = alloc_q.filter(models.Task.developer_id == developer_id)
        alloc_q = alloc_q.group_by(models.Task.sprint_id)
        alloc_by_sprint = dict(alloc_q.all())

        # Batch: developers (no task join needed)
        dev_q = db.query(models.Developer).filter(
            models.Developer.active == True,  # noqa: E712
            models.Developer.role.notin_(excluded_roles),
        )
        if developer_id:
            dev_q = dev_q.filter(models.Developer.id == developer_id)
        if allowed is not None:
            dev_q = dev_q.filter(models.Developer.id.in_(
                db.query(models.developer_projects.c.developer_id).filter(models.developer_projects.c.project_id.in_(allowed))
            ))
        if project_id:
            dev_q = dev_q.filter(models.Developer.id.in_(
                db.query(models.developer_projects.c.developer_id).filter(models.developer_projects.c.project_id == project_id)
            ))
        devs = dev_q.all()
        dev_ids = [d.id for d in devs]
        total_base_capacity = sum(d.base_capacity for d in devs)

        # Batch: all availability for all sprints in one query
        avail_map = defaultdict(dict)  # sprint_id -> {dev_id: leave_days}
        if dev_ids:
            avail_rows = (
                db.query(models.Availability.sprint_id, models.Availability.developer_id, models.Availability.leave_days)
                .filter(
                    models.Availability.developer_id.in_(dev_ids),
                    models.Availability.sprint_id.in_(sprint_ids),
                )
                .all()
            )
            for row in avail_rows:
                avail_map[row.sprint_id][row.developer_id] = row.leave_days or 0

        # Batch: per-developer allocated hours per sprint (for over/healthy/idle counts)
        per_dev_alloc_q = (
            db.query(
                models.Task.sprint_id,
                models.Task.developer_id,
                func.coalesce(func.sum(models.Task.estimated_hours), 0).label("hrs"),
            )
            .filter(
                models.Task.sprint_id.in_(sprint_ids),
                models.Task.developer_id.in_(dev_ids) if dev_ids else literal(False),
                func.lower(func.ltrim(func.rtrim(models.Task.status))).notin_(planning_statuses_list),
            )
        )
        if allowed is not None:
            per_dev_alloc_q = per_dev_alloc_q.filter(models.Task.project_id.in_(allowed))
        if project_id:
            per_dev_alloc_q = per_dev_alloc_q.filter(models.Task.project_id == project_id)
        per_dev_alloc_q = per_dev_alloc_q.group_by(models.Task.sprint_id, models.Task.developer_id)
        # {sprint_id: {dev_id: hours}}
        per_dev_alloc = defaultdict(dict)
        for row in per_dev_alloc_q.all():
            per_dev_alloc[row.sprint_id][row.developer_id] = float(row.hrs)

        # Build capacity map {dev_id: base_capacity}
        dev_capacity = {d.id: d.base_capacity for d in devs}

        monthly_data = []
        for s in all_sprints:
            alloc_hrs = float(alloc_by_sprint.get(s.id, 0))

            # Net capacity for this sprint (adjusted for leave)
            sprint_avail = avail_map.get(s.id, {})
            total_cap = sum(
                net_capacity(dev_capacity[did], sprint_avail.get(did, 0))
                for did in dev_ids
            )

            # Over / healthy / idle per developer
            dev_alloc = per_dev_alloc.get(s.id, {})
            over = healthy = idle = 0
            for did in dev_ids:
                assigned = dev_alloc.get(did, 0)
                cap = dev_capacity[did]
                pct = (assigned / cap * 100) if cap else 0
                if pct <= 0:
                    idle += 1
                elif pct > 100:
                    over += 1
                elif pct >= 60:
                    healthy += 1

            util_pct = round((alloc_hrs / total_cap * 100) if total_cap else 0)
            monthly_data.append({
                "month": s.name,
                "allocated_hours": alloc_hrs,
                "net_capacity": round(total_cap, 1),
                "utilization_pct": util_pct,
                "over_count": over,
                "healthy_count": healthy,
                "idle_count": idle,
            })

    t7 = time.perf_counter()
    print(f"[dashboard/all] Monthly utilization: {(t7 - t6)*1000:.0f}ms | TOTAL: {(t7 - t0)*1000:.0f}ms")

    return {
        "kpis": kpis_data,
        "status_breakdown": status_breakdown_data,
        "project_breakdown": project_breakdown_data,
        "work_type_breakdown": work_type_breakdown_data,
        "module_breakdown": module_breakdown_data,
        "sub_module_breakdown": sub_module_breakdown_data,
        "monthly_utilization": monthly_data,
    }
