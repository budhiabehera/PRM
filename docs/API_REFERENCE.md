# API Reference

Base URL (local dev): `http://localhost:8000`

All endpoints are prefixed with `/api`. Interactive Swagger docs are available at
`http://localhost:8000/docs` (FastAPI auto-generates this from the code).

**Authentication:** every endpoint below except `/api/auth/login` requires a
`Authorization: Bearer <token>` header. See the **Auth** section for how to get
a token, and `docs/AUTH_AND_ROLES.md` for the full role/permission matrix.

## Auth — `/api/auth`
| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Log in with username/password → JWT + user info |
| GET | `/api/auth/me` | Any logged-in user | Get the current user's profile |
| GET | `/api/auth/users` | Admin only | List all login accounts |
| POST | `/api/auth/users` | Admin only | Create a login account |
| DELETE | `/api/auth/users/{id}` | Admin only | Delete a login account |

## Projects — `/api/projects`
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/projects` | Any logged-in user | List all projects |
| GET | `/api/projects/stats` | Any logged-in user | KPI totals (project/task/hour counts) |
| GET | `/api/projects/{id}` | Any logged-in user | Get one project |
| POST | `/api/projects` | Admin, Manager | Create project |
| PUT | `/api/projects/{id}` | Admin, Manager | Update project |
| DELETE | `/api/projects/{id}` | Admin, Manager | Delete project |

## Modules — `/api/modules`, `/api/sub-modules`
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/modules` | Any logged-in user | List main modules |
| GET | `/api/modules/tree` | Any logged-in user | Main modules nested with sub-modules + counts |
| POST | `/api/modules` | Admin, Manager | Create main module |
| PUT | `/api/modules/{id}` | Admin, Manager | Update main module |
| DELETE | `/api/modules/{id}` | Admin, Manager | Delete main module |
| GET | `/api/sub-modules?main_module_id=` | Any logged-in user | List sub-modules (optionally filtered) |
| POST | `/api/sub-modules` | Admin, Manager | Create sub-module |
| PUT | `/api/sub-modules/{id}` | Admin, Manager | Update sub-module |
| DELETE | `/api/sub-modules/{id}` | Admin, Manager | Delete sub-module |

## Resources (Developers) — `/api/resources`
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/resources?module_id=&role=&skill=` | Any logged-in user | List developers with utilization stats |
| GET | `/api/resources/stats` | Any logged-in user | Team-wide capacity/utilization KPIs |
| GET | `/api/resources/{id}` | Any logged-in user | Get one developer |
| POST | `/api/resources` | Admin, Manager | Create developer |
| PUT | `/api/resources/{id}` | Admin, Manager | Update developer |
| DELETE | `/api/resources/{id}` | Admin, Manager | Delete developer |

## Work Types — `/api/work-types`
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/work-types` | Any logged-in user | List work types with completion stats |
| POST | `/api/work-types` | Admin, Manager | Create work type |
| PUT | `/api/work-types/{id}` | Admin, Manager | Update work type |
| DELETE | `/api/work-types/{id}` | Admin, Manager | Delete work type |

## Sprints — `/api/sprints`
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/sprints` | Any logged-in user | List sprints with capacity/utilization aggregates |
| GET | `/api/sprints/{id}` | Any logged-in user | Get one sprint with aggregates |
| POST | `/api/sprints` | Admin, Manager | Create sprint |
| PUT | `/api/sprints/{id}` | Admin, Manager | Update sprint |
| DELETE | `/api/sprints/{id}` | Admin, Manager | Delete sprint |

## Tasks — `/api/tasks`
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/tasks?project_id=&main_module_id=&sub_module_id=&developer_id=&work_type_id=&sprint_id=&status=&priority=` | Any logged-in user | List/filter tasks (joined detail view) |
| GET | `/api/tasks/{id}` | Any logged-in user | Get one task |
| POST | `/api/tasks` | Admin, Manager, Lead | Create task (`task_code` auto-generated if omitted) |
| PUT | `/api/tasks/{id}` | Admin/Manager/Lead (any task); Developer (own task only, `status`/`actual_hours` only) | Update task |
| DELETE | `/api/tasks/{id}` | Admin, Manager, Lead | Delete task |

## Availability — `/api/availability`
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/availability?sprint_id=&developer_id=` | Any logged-in user | List leave records |
| POST | `/api/availability` | Admin, Manager, Lead | Create or update (upsert) a leave record |
| DELETE | `/api/availability/{id}` | Admin, Manager, Lead | Delete leave record |

## Dashboard — `/api/dashboard`
| Method | Path | Description |
|---|---|---|
| GET | `/api/dashboard/kpis` | Top-line KPI summary |
| GET | `/api/dashboard/status-breakdown` | Task counts/hours grouped by status |
| GET | `/api/dashboard/project-breakdown` | Task counts/hours grouped by project |
| GET | `/api/dashboard/work-type-breakdown` | Task counts/hours grouped by work type |
| GET | `/api/dashboard/module-breakdown` | Task counts/hours grouped by main module |
| GET | `/api/dashboard/sub-module-breakdown` | Task counts/hours grouped by sub-module |
| GET | `/api/dashboard/monthly-utilization` | Per-sprint allocation/capacity/utilization + over/healthy/idle dev counts |

All `/api/dashboard/*`, `/api/utilization/*`, and `/api/timeline/*` endpoints require
any valid logged-in user (read-only, no role restriction).

## Utilization — `/api/utilization`
| Method | Path | Description |
|---|---|---|
| GET | `/api/utilization/grid` | Developer × Sprint(month) utilization grid |

## Timeline — `/api/timeline`
| Method | Path | Description |
|---|---|---|
| GET | `/api/timeline/gantt?project_id=&developer_id=` | Scheduled tasks for Gantt rendering |
| GET | `/api/timeline/monthly-allocation` | Hours allocated per sprint, split by project |

## Integrations — `/api/integrations`
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/integrations/settings` | Admin only | Get current Teams/Salesforce config |
| PUT | `/api/integrations/settings` | Admin only | Update Teams/Salesforce config |
| POST | `/api/integrations/teams/test` | Admin, Manager | Send a test message to the configured Teams channel |
| POST | `/api/integrations/salesforce/test` | Admin, Manager | Verify Salesforce OAuth credentials |
| POST | `/api/integrations/tasks/{task_id}/notify-teams` | Admin, Manager, Lead | Post a task update card to Teams |
| POST | `/api/integrations/tasks/{task_id}/sync-salesforce` | Admin, Manager, Lead | Create a Salesforce Case from this task |

See `docs/INTEGRATIONS.md` for setup steps.

## Reports — `/api/reports`
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/api/reports/salesforce-tasks?created_date=&created_from=&created_to=&customer=&product_id=&developer_id=&work_type_id=&status=&priority=&synced=` | Admin, Manager, Lead | Every task created in PRM (day-by-day), with summary totals |
| GET | `/api/reports/customers` | Admin, Manager, Lead | Distinct customer/property names, for filter dropdowns |
| GET | `/api/reports/daily-created-counts?days=14` | Admin, Manager, Lead | Task-creation counts per day, for the trend chart |
| GET | `/api/reports/project-progress` | Admin, Manager, Lead | Per-project task counts by status, % complete, hours |
| GET | `/api/reports/overdue-tasks?project_id=&developer_id=&priority=` | Admin, Manager, Lead | Tasks past their end date that aren't Completed, sorted most-overdue first |
| GET | `/api/reports/customer-summary` | Admin, Manager, Lead | Per-customer task volume, completion rate, and hours |
| GET | `/api/reports/time-variance?project_id=&developer_id=&status=` | Admin, Manager, Lead | Estimated vs. actual hours per task, flags over/under budget |

## Health (public, unauthenticated)
| Method | Path | Description |
|---|---|---|
| GET | `/` | Service status |
| GET | `/api/health` | Health check |

