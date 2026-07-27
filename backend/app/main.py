from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine, SessionLocal, run_lightweight_migrations
from .routers import (
    projects, modules, resources, tasks, sprints,
    work_types, dashboard, utilization, availability, timeline, auth as auth_router,
    integrations, reports,
)
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
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth routes are public (login itself can't require a token).
app.include_router(auth_router.router)

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


@app.on_event("startup")
def seed_on_startup():
    db = SessionLocal()
    try:
        seed_data.run_seed(db)
    finally:
        db.close()


@app.get("/")
def root():
    return {"status": "ok", "service": "PRM — Project & Resource Management API"}


@app.get("/api/health")
def health():
    return {"status": "healthy"}
