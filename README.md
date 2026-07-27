# FX Resource & Sprint Dashboard

A full-stack resource, sprint, and task-tracking dashboard for a multi-project
development team — built from the "Admin Panel" and "FX Resource & Sprint
Dashboard" prototypes.

**Stack**
- **Frontend:** React 18 + Vite + TailwindCSS
- **Backend:** Python (FastAPI) + SQLAlchemy
- **Database:** SQLite
- **State Management:** Zustand

## Quick start

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The database is created and seeded with sample
data automatically on first backend startup.

See `docs/DEPLOYMENT.md` for Docker Compose instructions and production notes.

## What's included

**Overview pages** (operational views)
- **Dashboard** — program-wide KPIs, status/project/work-type/module breakdowns, monthly utilization trend
- **Sprint View** — per-sprint drill-down with team utilization and task list
- **Tasks** — full filterable task list + Kanban board
- **Team** — resource cards with role, skill, and live utilization
- **Utilization** — Developer × Month utilization grid (leave-adjusted)
- **Availability** — manage developer leave days per sprint
- **Timeline** — Gantt-style task schedule + monthly hours-by-project allocation

**Admin pages** (configuration/CRUD)
- **Projects** — add/edit/delete, module assignment, status
- **Modules** — main module → sub-module hierarchy management
- **Resources** — developer CRUD with role/skill/capacity and filters
- **Work Types** — category + customer-commitment flag management
- **Sprints** — monthly sprint configuration with live capacity/utilization stats
- **Assignments** — full task-creation form (project → module → sub-module → developer → work type → sprint) with recent-assignments list
- **Availability** — same leave management as the Overview page
- **Settings** — app info and capacity assumptions

## Project structure

```
backend/    FastAPI app, SQLAlchemy models, routers, seed data
frontend/   React app (pages, components, services, hooks, store)
docs/       API reference, DB schema, deployment guide
```

See `docs/API_REFERENCE.md` and `docs/DATABASE_SCHEMA.md` for details.

## Data model

8 core tables: **Project, MainModule, SubModule, Developer, WorkType, Sprint,
Task, Availability.** Utilization is computed from `estimated_hours` assigned
per sprint against each developer's `base_capacity` (96 hrs/month for
Leads/Managers, 192 for full-time developers), adjusted for logged leave days.
