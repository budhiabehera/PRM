# API Reference

Base URL (local dev): `http://localhost:8000`

All endpoints are prefixed with `/api`. Interactive Swagger docs are available at
`http://localhost:8000/docs` (FastAPI auto-generates this from the code).

## Projects — `/api/projects`
| Method | Path | Description |
|---|---|---|
| GET | `/api/projects` | List all projects |
| GET | `/api/projects/stats` | KPI totals (project/task/hour counts) |
| GET | `/api/projects/{id}` | Get one project |
| POST | `/api/projects` | Create project |
| PUT | `/api/projects/{id}` | Update project |
| DELETE | `/api/projects/{id}` | Delete project |

## Modules — `/api/modules`, `/api/sub-modules`
| Method | Path | Description |
|---|---|---|
| GET | `/api/modules` | List main modules |
| GET | `/api/modules/tree` | Main modules nested with sub-modules + counts |
| POST | `/api/modules` | Create main module |
| PUT | `/api/modules/{id}` | Update main module |
| DELETE | `/api/modules/{id}` | Delete main module |
| GET | `/api/sub-modules?main_module_id=` | List sub-modules (optionally filtered) |
| POST | `/api/sub-modules` | Create sub-module |
| PUT | `/api/sub-modules/{id}` | Update sub-module |
| DELETE | `/api/sub-modules/{id}` | Delete sub-module |

## Resources (Developers) — `/api/resources`
| Method | Path | Description |
|---|---|---|
| GET | `/api/resources?module_id=&role=&skill=` | List developers with utilization stats |
| GET | `/api/resources/stats` | Team-wide capacity/utilization KPIs |
| GET | `/api/resources/{id}` | Get one developer |
| POST | `/api/resources` | Create developer |
| PUT | `/api/resources/{id}` | Update developer |
| DELETE | `/api/resources/{id}` | Delete developer |

## Work Types — `/api/work-types`
| Method | Path | Description |
|---|---|---|
| GET | `/api/work-types` | List work types with completion stats |
| POST | `/api/work-types` | Create work type |
| PUT | `/api/work-types/{id}` | Update work type |
| DELETE | `/api/work-types/{id}` | Delete work type |

## Sprints — `/api/sprints`
| Method | Path | Description |
|---|---|---|
| GET | `/api/sprints` | List sprints with capacity/utilization aggregates |
| GET | `/api/sprints/{id}` | Get one sprint with aggregates |
| POST | `/api/sprints` | Create sprint |
| PUT | `/api/sprints/{id}` | Update sprint |
| DELETE | `/api/sprints/{id}` | Delete sprint |

## Tasks — `/api/tasks`
| Method | Path | Description |
|---|---|---|
| GET | `/api/tasks?project_id=&main_module_id=&sub_module_id=&developer_id=&work_type_id=&sprint_id=&status=&priority=` | List/filter tasks (joined detail view) |
| GET | `/api/tasks/{id}` | Get one task |
| POST | `/api/tasks` | Create task (`task_code` auto-generated if omitted) |
| PUT | `/api/tasks/{id}` | Update task |
| DELETE | `/api/tasks/{id}` | Delete task |

## Availability — `/api/availability`
| Method | Path | Description |
|---|---|---|
| GET | `/api/availability?sprint_id=&developer_id=` | List leave records |
| POST | `/api/availability` | Create or update (upsert) a leave record |
| DELETE | `/api/availability/{id}` | Delete leave record |

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

## Utilization — `/api/utilization`
| Method | Path | Description |
|---|---|---|
| GET | `/api/utilization/grid` | Developer × Sprint(month) utilization grid |

## Timeline — `/api/timeline`
| Method | Path | Description |
|---|---|---|
| GET | `/api/timeline/gantt?project_id=&developer_id=` | Scheduled tasks for Gantt rendering |
| GET | `/api/timeline/monthly-allocation` | Hours allocated per sprint, split by project |

## Health
| Method | Path | Description |
|---|---|---|
| GET | `/` | Service status |
| GET | `/api/health` | Health check |
