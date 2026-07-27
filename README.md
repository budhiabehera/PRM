# PRM — Project & Resource Management

A full-stack resource, sprint, and task-tracking dashboard for a multi-project
development team — built from the "Admin Panel" and "FX Resource & Sprint
Dashboard" prototypes, now branded as **PRM (Project & Resource Management)**.

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
data automatically on first backend startup, including 4 demo login accounts
(see below). See `docs/DEPLOYMENT.md` for Docker Compose instructions and
production notes.

## Login & roles

The app requires login. Four demo accounts are seeded automatically:

| Username | Password | Role |
|---|---|---|
| `admin` | `Admin@123` | Admin — full access |
| `elango.manager` | `Manager@123` | Manager — full access except user management |
| `ramesh.lead` | `Lead@123` | Lead — can create/edit/delete any task, no project/resource config |
| `srishti.dev` | `Dev@123` | Developer — can only update status/hours on their own assigned tasks |

The login page has one-click buttons to fill in each demo account. Full
permission matrix and how to wire up real domain/SSO login: see
`docs/AUTH_AND_ROLES.md`.

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
- **Users** — Admin-only login account management
- **Settings** — app info, capacity assumptions, and Microsoft Teams / Salesforce integration configuration

**Reports** (Admin, Manager, Lead)
- **Salesforce Tasks** — daily log of every task created in PRM, filterable by date, customer, product, developer, work type, status, priority, and Salesforce sync state; sync any unsynced task to Salesforce directly from the list
- **Project Progress** — per-project completion %, task counts by status, and hours (estimated/actual/remaining)
- **Overdue Tasks** — tasks past their end date that aren't Completed, sorted most-overdue first
- **Customer Summary** — task volume, completion rate, and hours by customer/property
- **Time Variance** — estimated vs. actual hours per task, flagging what's running over or under budget

## Integrations

PRM can post task notifications to a **Microsoft Teams** channel and sync
tasks to **Salesforce** as Cases. Both are optional, off by default, and
configured entirely from Admin → Settings (Admin role only) — no code changes
needed. See `docs/INTEGRATIONS.md` for the exact setup steps for each.

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
