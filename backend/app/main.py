from fastapi import FastAPI, Depends

from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine, SessionLocal, run_lightweight_migrations
from .routers import (
    projects, modules, resources, tasks, sprints,
    work_types, dashboard, utilization, availability, timeline, auth as auth_router,
    integrations, reports,
)
from .routers import task_activities
from .routers import user_setup
from .routers import skills
from .routers import task_attachments
from .routers import holidays
from .routers import role_capacities
from .routers import resource_calendar
from .routers import task_statuses
from .routers import page_access
from .routers import time_logs
from .routers import notifications
from .routers import my_dashboard
from .routers import standup
from .routers import knowledge_base
from .routers import audit_log
from .routers import kb_categories
from .routers import engineering
from .routers import user_settings
from .routers import alerts
from .routers import pm_chat
from .deps import get_current_user
from . import seed_data

run_lightweight_migrations()
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="PRM — Project & Resource Management API",
    description="Backend for Project & Resource Management (PRM): projects, modules, resources, tasks, sprints, and MS Teams / Salesforce integrations.",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://prm-h9cye9gda4g0fher.southeastasia-01.azurewebsites.net",
        "http://localhost:5173",
        "http://localhost:8001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Auth routes are public (login itself can't require a token).
app.include_router(auth_router.router)

# Public integration endpoints (no auth required)
app.include_router(integrations.public_router)

# Public webhook endpoint for Bitbucket (HMAC-verified, no user auth)
app.include_router(engineering.webhook_router)

# Every other route requires a valid logged-in user. Fine-grained role checks
# (e.g. "only Admin/Manager/Lead can edit this task") are applied per-endpoint
# inside each router via app.deps.require_roles / can_edit_task / can_delete_task.
protected = Depends(get_current_user)
app.include_router(projects.router, dependencies=[protected])
app.include_router(modules.router, dependencies=[protected])
app.include_router(modules.sub_router, dependencies=[protected])
app.include_router(resources.router, dependencies=[protected])
app.include_router(tasks.router, dependencies=[protected])
app.include_router(sprints.router, dependencies=[protected])
app.include_router(work_types.router, dependencies=[protected])
app.include_router(dashboard.router, dependencies=[protected])
app.include_router(utilization.router, dependencies=[protected])
app.include_router(availability.router, dependencies=[protected])
app.include_router(timeline.router, dependencies=[protected])
app.include_router(integrations.router, dependencies=[protected])
app.include_router(reports.router, dependencies=[protected])
app.include_router(task_activities.router, dependencies=[protected])
app.include_router(user_setup.router, dependencies=[protected])
app.include_router(skills.router, dependencies=[protected])
app.include_router(task_attachments.router, dependencies=[protected])
app.include_router(holidays.router, dependencies=[protected])
app.include_router(role_capacities.router, dependencies=[protected])
app.include_router(resource_calendar.router, dependencies=[protected])
app.include_router(task_statuses.router, dependencies=[protected])
app.include_router(page_access.router, dependencies=[protected])
app.include_router(time_logs.router, dependencies=[protected])
app.include_router(notifications.router, dependencies=[protected])
app.include_router(my_dashboard.router, dependencies=[protected])
app.include_router(standup.router, dependencies=[protected])
app.include_router(knowledge_base.router, dependencies=[protected])
app.include_router(audit_log.router, dependencies=[protected])
app.include_router(kb_categories.router, dependencies=[protected])
app.include_router(user_settings.router, dependencies=[protected])
app.include_router(engineering.router, dependencies=[protected])
app.include_router(user_settings.preset_router, dependencies=[protected])
app.include_router(alerts.router, dependencies=[protected])

app.include_router(pm_chat.router, dependencies=[protected])


@app.on_event("startup")
def seed_on_startup():
    db = SessionLocal()
    try:
        seed_data.run_seed(db)
    finally:
        db.close()

    # Start the background scheduler for daily hours check (10 PM IST)
    from .services.scheduler import start_hours_check_scheduler
    start_hours_check_scheduler()



@app.get("/api/health")
def health():
    return {"status": "healthy"}


@app.get("/")
def root():
    return {"status": "ok", "service": "PRM — Project & Resource Management API"}
