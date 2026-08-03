from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

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


@app.on_event("startup")
def seed_on_startup():
    db = SessionLocal()
    try:
        seed_data.run_seed(db)
    finally:
        db.close()



@app.get("/api/health")
def health():
    return {"status": "healthy"}


# --- Serve Frontend Production Build ---
import os
FRONTEND_DIST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "frontend", "dist")

if os.path.isdir(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="static-assets")

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        """Serve the React SPA — all non-API routes return index.html."""
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
else:
    @app.get("/")
    def root():
        return {"status": "ok", "service": "PRM — Project & Resource Management API"}
