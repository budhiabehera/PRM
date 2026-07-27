# Database Schema

SQLite database (`backend/resource_tracker.db`), managed via SQLAlchemy ORM
(`backend/app/models.py`). 8 core tables.

```
MainModule (main_modules)
 ├── id, name, description
 └── 1───∞ SubModule (sub_modules)
              ├── id, name, main_module_id (FK)

Project (projects)
 ├── id, name, code, main_module_id (FK, nullable), status,
 │   start_date, end_date, description

Developer (developers)
 ├── id, dev_code, name, role, home_module_id (FK), skill,
 │   base_capacity, active
 └── 1───∞ Availability (availabilities)
              ├── id, developer_id (FK), sprint_id (FK), leave_days, notes

WorkType (work_types)
 ├── id, name, customer_committed, color

Sprint (sprints)
 ├── id, name, start_date, end_date, status

Task (tasks)
 ├── id, task_code, case_ref, property_client, description,
 │   project_id (FK), main_module_id (FK), sub_module_id (FK),
 │   developer_id (FK), work_type_id (FK), sprint_id (FK),
 │   priority, status, customer_committed,
 │   start_date, end_date, estimated_hours, actual_hours,
 │   created_at, salesforce_case_id
```

`created_at` is set automatically when a task is created (used by the Admin >
Salesforce Tasks daily report — distinct from `start_date`, which is the
planned work date and can be in the past or future). `salesforce_case_id` is
populated once a task has been pushed to Salesforce (see
`docs/INTEGRATIONS.md`) and is kept separate from `case_ref`, which may hold
an unrelated internal case number.

### Upgrading an existing database

`app/database.py` runs a small startup migration (`run_lightweight_migrations`)
that adds any newly-introduced columns to an existing SQLite database without
touching your data — so pulling a newer version of PRM and restarting the
backend is enough; you don't need to delete `resource_tracker.db`.

## Entity relationship summary

| Table | Relates to |
|---|---|
| `main_modules` | has many `sub_modules`, `projects`, `developers` (home module), `tasks` |
| `sub_modules` | belongs to `main_modules`; has many `tasks` |
| `projects` | belongs to `main_modules` (optional); has many `tasks` |
| `developers` | belongs to `main_modules` (home module); has many `tasks`, `availabilities` |
| `work_types` | has many `tasks` |
| `sprints` | has many `tasks`, `availabilities` |
| `tasks` | belongs to `projects`, `main_modules`, `sub_modules`, `developers`, `work_types`, `sprints` |
| `availabilities` | belongs to `developers` and `sprints` (one row per developer/sprint) |

## Computed fields (not stored, calculated on read)

- `Task.percent_complete` — `actual_hours / estimated_hours`, capped at 150%.
- `Task.is_cross_month` — `True` if `start_date` and `end_date` fall in different
  calendar months.
- Developer utilization % — `assigned_hours / base_capacity` (see
  `app/utils/calculations.py`).
- Net capacity — `base_capacity` reduced proportionally by `leave_days` for the
  sprint (assumes 22 working days/month).

## Seed data

`backend/app/seed_data.py` populates the database on first run (skipped if
projects already exist) with sample data modeled on the FX prototype: 5 main
modules, sub-modules, 6 projects, 39 developers, 5 work types, 6 sprints
(Jul–Dec 2026), and 33 tasks.
