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
    project_ids: List[int] = []
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


# ---------- Unified User Setup (creates Developer + User login in one go) ----------
class UserSetupCreate(BaseModel):
    dev_code: str
    username: str
    full_name: str
    email: str
    password: Optional[str] = None
    role: str = "Developer"
    skill: str = "Backend"
    project_ids: List[int] = []
    base_capacity: float = 192
    active: bool = True
    reporting_to_id: Optional[int] = None


class UserSetupUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    skill: Optional[str] = None
    project_ids: Optional[List[int]] = None
    base_capacity: Optional[float] = None
    active: Optional[bool] = None
    reporting_to_id: Optional[int] = None


# ---------- Skill ----------
class SkillBase(BaseModel):
    name: str
    description: Optional[str] = ""


class SkillCreate(SkillBase):
    pass


class Skill(SkillBase):
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
    project_id: Optional[int] = None


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
    subject: Optional[str] = ""
    point_of_contact: Optional[str] = ""
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
    subject: Optional[str] = ""
    point_of_contact: Optional[str] = ""
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


class ChangePassword(BaseModel):
    current_password: str
    new_password: str


class UserCreate(BaseModel):
    username: str
    password: str
    full_name: str
    email: Optional[str] = None
    role: str = "Developer"  # Admin, Manager, Lead, Developer
    developer_id: Optional[int] = None
    project_ids: List[int] = []


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    developer_id: Optional[int] = None
    project_ids: Optional[List[int]] = None
    active: Optional[bool] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    full_name: str
    email: Optional[str] = None
    role: str
    developer_id: Optional[int] = None
    project_ids: List[int] = []
    active: bool


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Integrations ----------
# ---------- Task Activity ----------
class TaskActivityCreate(BaseModel):
    task_id: int
    developer_id: Optional[int] = None
    activity_date: date
    description: str
    hours_spent: float = 0
    percentage: float = 0


class TaskActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    task_id: int
    developer_id: Optional[int] = None
    activity_date: date
    description: str
    hours_spent: float
    percentage: float
    created_at: Optional[datetime] = None


# ---------- Task Attachment ----------
class TaskAttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    task_id: int
    file_name: str
    blob_name: str
    file_size: int
    content_type: str
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: Optional[datetime] = None
    last_modified: Optional[datetime] = None


# ---------- Holiday ----------
class HolidayCreate(BaseModel):
    date: date
    name: str


class HolidayOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    date: date
    name: str
    month: int
    year: int
    created_by_id: Optional[int] = None
    created_by_name: Optional[str] = None
    created_at: Optional[datetime] = None


# ---------- Role Capacity ----------
class RoleCapacityCreate(BaseModel):
    role: str
    capacity_hours: float = 192
    description: Optional[str] = ""


class RoleCapacityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    role: str
    capacity_hours: float
    description: Optional[str] = ""
    created_at: Optional[datetime] = None


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
    azure_blob_connection_string: Optional[str] = None
    task_link_base_url: str = "http://localhost:5173/tasks/"
    company_logo_url: str = "https://fx1fxposprod.blob.core.windows.net/liaison/PrimaryLogo-TriColour-min.png"
    smtp_enabled: bool = False
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_email: Optional[str] = None
    smtp_from_name: str = "PRM System"
    smtp_use_tls: bool = True


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
