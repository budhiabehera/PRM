from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import Base, engine, SessionLocal
from .routers import (
    projects, modules, resources, tasks, sprints,
    work_types, dashboard, utilization, availability, timeline,
)
from . import seed_data

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="FX Resource & Sprint Dashboard API",
    description="Backend for the FX Resource & Sprint Dashboard (Projects, Modules, Resources, Tasks, Sprints).",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router)
app.include_router(modules.router)
app.include_router(modules.sub_router)
app.include_router(resources.router)
app.include_router(tasks.router)
app.include_router(sprints.router)
app.include_router(work_types.router)
app.include_router(dashboard.router)
app.include_router(utilization.router)
app.include_router(availability.router)
app.include_router(timeline.router)


@app.on_event("startup")
def seed_on_startup():
    db = SessionLocal()
    try:
        seed_data.run_seed(db)
    finally:
        db.close()


@app.get("/")
def root():
    return {"status": "ok", "service": "FX Resource & Sprint Dashboard API"}


@app.get("/api/health")
def health():
    return {"status": "healthy"}
