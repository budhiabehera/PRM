from datetime import date, datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


# ---------- Main Module ----------
class MainModuleBase(BaseModel):
    name: str
    description: Optional[str] = ""


class MainModuleCreate(MainModuleBase):
    pass


class MainModule(MainModuleBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Sub Module ----------
class SubModuleBase(BaseModel):
    name: str
    main_module_id: int


class SubModuleCreate(SubModuleBase):
    pass


class SubModule(SubModuleBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Project ----------
class ProjectBase(BaseModel):
    name: str
    code: str
    main_module_id: Optional[int] = None
    status: str = "Active"
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    description: Optional[str] = ""


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(ProjectBase):
    name: Optional[str] = None
    code: Optional[str] = None


class Project(ProjectBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Developer ----------
class DeveloperBase(BaseModel):
    dev_code: str
    name: str
    role: str = "Developer"
    home_module_id: Optional[int] = None
    skill: str = "Backend"
    base_capacity: float = 192
    active: bool = True


class DeveloperCreate(DeveloperBase):
    pass


class DeveloperUpdate(DeveloperBase):
    dev_code: Optional[str] = None
    name: Optional[str] = None


class Developer(DeveloperBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Work Type ----------
class WorkTypeBase(BaseModel):
    name: str
    customer_committed: bool = False
    color: str = "#4f46e5"


class WorkTypeCreate(WorkTypeBase):
    pass


class WorkType(WorkTypeBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Sprint ----------
class SprintBase(BaseModel):
    name: str
    start_date: date
    end_date: date
    status: str = "Not Started"


class SprintCreate(SprintBase):
    pass


class SprintUpdate(SprintBase):
    name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class Sprint(SprintBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Availability ----------
class AvailabilityBase(BaseModel):
    developer_id: int
    sprint_id: int
    leave_days: float = 0
    notes: Optional[str] = ""


class AvailabilityCreate(AvailabilityBase):
    pass


class Availability(AvailabilityBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Task ----------
class TaskBase(BaseModel):
    case_ref: Optional[str] = ""
    property_client: Optional[str] = ""
    description: str
    project_id: Optional[int] = None
    main_module_id: Optional[int] = None
    sub_module_id: Optional[int] = None
    developer_id: Optional[int] = None
    work_type_id: Optional[int] = None
    sprint_id: Optional[int] = None
    priority: str = "Medium"
    status: str = "Not Started"
    customer_committed: bool = False
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    estimated_hours: float = 0
    actual_hours: float = 0


class TaskCreate(TaskBase):
    task_code: Optional[str] = None  # auto-generated if not supplied


class TaskUpdate(TaskBase):
    description: Optional[str] = None


class Task(TaskBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    task_code: str


class TaskDetail(Task):
    project_name: Optional[str] = None
    main_module_name: Optional[str] = None
    sub_module_name: Optional[str] = None
    developer_name: Optional[str] = None
    work_type_name: Optional[str] = None
    sprint_name: Optional[str] = None
    percent_complete: int = 0
    is_cross_month: bool = False
    created_at: Optional[datetime] = None
    salesforce_case_id: Optional[str] = None


# ---------- Auth / Users ----------
class UserLogin(BaseModel):
    username: str
    password: str


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    email: Optional[str] = None
    role: str = "Developer"  # Admin, Manager, Lead, Developer
    developer_id: Optional[int] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    full_name: str
    email: Optional[str] = None
    role: str
    developer_id: Optional[int] = None
    active: bool


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Integrations ----------
class IntegrationSettingsIn(BaseModel):
    teams_enabled: bool = False
    teams_webhook_url: Optional[str] = None
    salesforce_enabled: bool = False
    salesforce_login_url: str = "https://login.salesforce.com"
    salesforce_client_id: Optional[str] = None
    salesforce_client_secret: Optional[str] = None
    salesforce_username: Optional[str] = None
    salesforce_password: Optional[str] = None
    salesforce_security_token: Optional[str] = None


class IntegrationSettingsOut(IntegrationSettingsIn):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Dashboard aggregates ----------
class KPISummary(BaseModel):
    total_developers: int
    total_tasks: int
    total_estimated_hours: float
    customer_committed_tasks: int
    cross_month_tasks: int


class StatusBreakdown(BaseModel):
    status: str
    count: int
    estimated_hours: float


class ProjectBreakdown(BaseModel):
    project: str
    tasks: int
    estimated_hours: float
    remaining_hours: float


class WorkTypeBreakdown(BaseModel):
    work_type: str
    customer_committed: bool
    tasks: int
    estimated_hours: float
    actual_hours: float


class ModuleBreakdown(BaseModel):
    module: str
    developers: int
    tasks: int
    estimated_hours: float


class SubModuleBreakdown(BaseModel):
    sub_module: str
    main_module: str
    tasks: int
    estimated_hours: float


class MonthlyUtilization(BaseModel):
    month: str
    allocated_hours: float
    net_capacity: float
    utilization_pct: float
    over_count: int
    healthy_count: int
    idle_count: int


class UtilizationCell(BaseModel):
    developer_id: int
    developer_name: str
    role: str
    module: Optional[str] = None
    month: str
    capacity: float
    allocated_hours: float
    utilization_pct: float
    status: str  # over, healthy, under, idle
