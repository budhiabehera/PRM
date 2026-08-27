from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Date, ForeignKey, Text, DateTime, Table, UniqueConstraint
)
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

# IST timezone helper — use as default= in Column definitions
IST = timezone(timedelta(hours=5, minutes=30))
def _now_ist():
    return datetime.now(IST)


# Many-to-many: Users <-> Projects
user_projects = Table(
    "user_projects", Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("project_id", Integer, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
)

# Many-to-many: Developers <-> Projects
developer_projects = Table(
    "developer_projects", Base.metadata,
    Column("developer_id", Integer, ForeignKey("developers.id", ondelete="CASCADE"), primary_key=True),
    Column("project_id", Integer, ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
)


class IntegrationSettings(Base):
    """Singleton row (id=1) holding external integration configuration.
    Editable only by Admins via Admin > Settings."""
    __tablename__ = "integration_settings"

    id = Column(Integer, primary_key=True, index=True)

    teams_enabled = Column(Boolean, default=False)
    teams_webhook_url = Column(String(500), nullable=True)

    salesforce_enabled = Column(Boolean, default=False)
    salesforce_login_url = Column(String(255), default="https://login.salesforce.com")
    salesforce_client_id = Column(String(255), nullable=True)
    salesforce_client_secret = Column(String(255), nullable=True)
    salesforce_username = Column(String(255), nullable=True)
    salesforce_password = Column(String(255), nullable=True)
    salesforce_security_token = Column(String(255), nullable=True)

    # Azure Blob & Notification settings
    azure_blob_connection_string = Column(String(500), nullable=True)
    task_link_base_url = Column(String(255), default="http://localhost:5173/tasks/")
    company_logo_url = Column(String(500), default="https://fx1fxposprod.blob.core.windows.net/liaison/PrimaryLogo-TriColour-min.png")

    # SMTP Email settings
    smtp_enabled = Column(Boolean, default=False)
    smtp_host = Column(String(255), nullable=True)
    smtp_port = Column(Integer, default=587)
    smtp_username = Column(String(255), nullable=True)
    smtp_password = Column(String(255), nullable=True)
    smtp_from_email = Column(String(255), nullable=True)
    smtp_from_name = Column(String(100), default="PRM System")
    smtp_use_tls = Column(Boolean, default=True)

class User(Base):
    """Login account. Roles: Admin, Manager, Lead, Developer.
    Optionally linked to a Developer record (so a Lead/Developer's task
    permissions can be scoped to "their own" tasks/module)."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(150), nullable=True)
    full_name = Column(String(150), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="Developer")  # Admin, Manager, Lead, Developer
    developer_id = Column(Integer, ForeignKey("developers.id"), nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=_now_ist)

    developer = relationship("Developer", back_populates="user_account")
    projects = relationship("Project", secondary=user_projects, backref="users")


class UserPreference(Base):
    """Key-value preferences per user (e.g., default_project, default_sprint, theme)."""
    __tablename__ = "user_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    key = Column(String(100), nullable=False)
    value = Column(Text, nullable=True)  # JSON-encoded value
    created_at = Column(DateTime(timezone=True), default=_now_ist)
    updated_at = Column(DateTime(timezone=True), default=_now_ist, onupdate=_now_ist)

    user = relationship("User", backref="preferences")

    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_user_pref_key"),)


class FilterPreset(Base):
    """Named saved filter views per user per page."""
    __tablename__ = "filter_presets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    page = Column(String(50), nullable=False)  # 'dashboard', 'tasks', 'utilization'
    filters = Column(Text, nullable=False)  # JSON-encoded filter state
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=_now_ist)
    updated_at = Column(DateTime(timezone=True), default=_now_ist, onupdate=_now_ist)

    user = relationship("User", backref="filter_presets")


class MainModule(Base):
    __tablename__ = "main_modules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(String(255), default="")
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)

    sub_modules = relationship("SubModule", back_populates="main_module", cascade="all, delete-orphan")
    project = relationship("Project", back_populates="modules", foreign_keys=[project_id])
    developers = relationship("Developer", back_populates="home_module")
    tasks = relationship("Task", back_populates="main_module")


class SubModule(Base):
    __tablename__ = "sub_modules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    main_module_id = Column(Integer, ForeignKey("main_modules.id"), nullable=False)

    main_module = relationship("MainModule", back_populates="sub_modules")
    tasks = relationship("Task", back_populates="sub_module")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    code = Column(String(50), unique=True, nullable=False)
    main_module_id = Column(Integer, ForeignKey("main_modules.id"), nullable=True)
    status = Column(String(30), default="Active")  # Active, Inactive, Planning, Completed
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    description = Column(Text, default="")

    modules = relationship("MainModule", back_populates="project", foreign_keys="[MainModule.project_id]")
    tasks = relationship("Task", back_populates="project")


class Developer(Base):
    __tablename__ = "developers"

    id = Column(Integer, primary_key=True, index=True)
    dev_code = Column(String(20), unique=True, nullable=False)  # e.g. DEV001
    name = Column(String(150), nullable=False)
    role = Column(String(50), default="Developer")  # Manager, Lead - Manager, Lead, Developer
    home_module_id = Column(Integer, ForeignKey("main_modules.id"), nullable=True)
    skill = Column(String(50), default="Backend")  # Backend, Frontend, Mobile
    base_capacity = Column(Float, default=192)  # hrs/month
    active = Column(Boolean, default=True)
    reporting_to_id = Column(Integer, ForeignKey("developers.id"), nullable=True)

    home_module = relationship("MainModule", back_populates="developers")
    projects = relationship("Project", secondary=developer_projects, backref="assigned_developers")
    tasks = relationship("Task", back_populates="developer")
    availabilities = relationship("Availability", back_populates="developer", cascade="all, delete-orphan")
    user_account = relationship("User", back_populates="developer", uselist=False)
    reporting_to = relationship("Developer", remote_side=[id], foreign_keys=[reporting_to_id])


class Skill(Base):
    __tablename__ = "skills"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(String(255), default="")


class WorkType(Base):
    __tablename__ = "work_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    customer_committed = Column(Boolean, default=False)
    color = Column(String(20), default="#4f46e5")

    tasks = relationship("Task", back_populates="work_type")


class Sprint(Base):
    __tablename__ = "sprints"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(30), unique=True, nullable=False)  # e.g. Jul-2026
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String(30), default="Not Started")  # Not Started, Planned, Active, Completed
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)

    project = relationship("Project")
    tasks = relationship("Task", back_populates="sprint")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_code = Column(String(20), unique=True, nullable=False)  # e.g. T09001
    case_ref = Column(String(100), default="")
    subject = Column(String(255), default="")
    point_of_contact = Column(String(150), default="")
    property_client = Column(String(150), default="")
    description = Column(Text, nullable=False)

    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    main_module_id = Column(Integer, ForeignKey("main_modules.id"), nullable=True)
    sub_module_id = Column(Integer, ForeignKey("sub_modules.id"), nullable=True)
    developer_id = Column(Integer, ForeignKey("developers.id"), nullable=True)
    work_type_id = Column(Integer, ForeignKey("work_types.id"), nullable=True)
    sprint_id = Column(Integer, ForeignKey("sprints.id"), nullable=True)

    priority = Column(String(20), default="Medium")  # Critical, High, Medium, Low
    status = Column(String(30), default="Not Started")
    customer_committed = Column(Boolean, default=False)
    team = Column(String(100), nullable=True)  # e.g. Backend, Frontend, QA, DevOps

    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    estimated_hours = Column(Float, default=0)
    actual_hours = Column(Float, default=0)
    percentage = Column(Float, default=0)  # task completion % (updated from activity log)

    # When this task record was actually created in PRM (distinct from start_date,
    # which is the planned work date and can be set in the future/past). Powers
    # the "tasks created every day" Salesforce Tasks report.
    created_at = Column(DateTime(timezone=True), default=_now_ist)
    # Set once a task has been pushed to Salesforce as a Case (see
    # app/integrations/salesforce.py). Kept separate from `case_ref` so an
    # internal case number a user typed in isn't overwritten by the sync.
    salesforce_case_id = Column(String(30), nullable=True)

    project = relationship("Project", back_populates="tasks")
    main_module = relationship("MainModule", back_populates="tasks")
    sub_module = relationship("SubModule", back_populates="tasks")
    developer = relationship("Developer", back_populates="tasks")
    work_type = relationship("WorkType", back_populates="tasks")
    sprint = relationship("Sprint", back_populates="tasks")

    @property
    def percent_complete(self):
        # Prefer manually-set percentage from activity log
        if self.percentage and self.percentage > 0:
            return round(self.percentage)
        if not self.estimated_hours:
            return 0
        return round(min(self.actual_hours / self.estimated_hours, 1.5) * 100)

    @property
    def is_cross_month(self):
        if not self.start_date or not self.end_date:
            return False
        return (self.start_date.year, self.start_date.month) != (self.end_date.year, self.end_date.month)


class Availability(Base):
    """Leave / reduced-capacity records for a developer in a given sprint/month."""
    __tablename__ = "availabilities"

    id = Column(Integer, primary_key=True, index=True)
    developer_id = Column(Integer, ForeignKey("developers.id"), nullable=False)
    sprint_id = Column(Integer, ForeignKey("sprints.id"), nullable=False)
    leave_days = Column(Float, default=0)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    notes = Column(String(255), default="")

    developer = relationship("Developer", back_populates="availabilities")
    sprint = relationship("Sprint")


class TaskActivity(Base):
    """Daily activity log entries for a task — captures what was done each day."""
    __tablename__ = "task_activities"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    developer_id = Column(Integer, ForeignKey("developers.id"), nullable=True)
    activity_date = Column(Date, nullable=False)
    description = Column(Text, nullable=False)
    hours_spent = Column(Float, default=0)
    percentage = Column(Float, default=0)  # task % completion at this point
    created_at = Column(DateTime(timezone=True), default=_now_ist)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    task = relationship("Task", backref="activities")
    developer = relationship("Developer")
    created_by = relationship("User", foreign_keys=[created_by_id])


class TaskAttachment(Base):
    """File attachments stored in Azure Blob Storage for a task."""
    __tablename__ = "task_attachments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    file_name = Column(String(255), nullable=False)
    blob_name = Column(String(500), nullable=False)  # full blob path in container
    file_size = Column(Integer, default=0)  # bytes
    content_type = Column(String(100), default="application/octet-stream")
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now_ist)
    last_modified = Column(DateTime(timezone=True), default=_now_ist)

    task = relationship("Task", backref="attachments")
    created_by = relationship("User", foreign_keys=[created_by_id])


class Holiday(Base):
    """Company holidays. Weekends (Sat/Sun) are implicit; this stores
    additional declared holidays (e.g. national holidays, company days off)."""
    __tablename__ = "holidays"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, unique=True, nullable=False, index=True)
    name = Column(String(150), nullable=False)
    month = Column(Integer, nullable=False)  # 1-12, derived from date for fast filtering
    year = Column(Integer, nullable=False)   # e.g. 2026
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now_ist)

    created_by = relationship("User", foreign_keys=[created_by_id])


class RoleCapacity(Base):
    """Defines default capacity (hours/month) per role.
    Used to auto-fill base_capacity in User Setup when a role is selected."""
    __tablename__ = "role_capacities"

    id = Column(Integer, primary_key=True, index=True)
    role = Column(String(50), unique=True, nullable=False)  # e.g. Admin, Manager, Lead, Developer
    capacity_hours = Column(Float, nullable=False, default=192)  # hrs/month
    description = Column(String(255), default="")
    created_at = Column(DateTime(timezone=True), default=_now_ist)


class TaskStatus(Base):
    """User-defined task statuses (e.g., Not Started, In Progress, etc.)."""
    __tablename__ = "task_statuses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    color = Column(String(20), default="#4f46e5")
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=_now_ist)


class PageAccess(Base):
    """Controls which roles can see which pages/menu items."""
    __tablename__ = "page_access"

    id = Column(Integer, primary_key=True, index=True)
    page_key = Column(String(100), nullable=False)   # e.g. '/tasks', '/admin/projects'
    page_label = Column(String(100), nullable=False)  # e.g. 'Tasks', 'Projects'
    section = Column(String(50), default="overview")  # overview, admin, reports
    roles = Column(String(500), nullable=False)       # comma-separated: "Admin,Manager,Lead,Developer"
    created_at = Column(DateTime(timezone=True), default=_now_ist)


class TimeLog(Base):
    """Time logging entries — developers log hours against tasks per day."""
    __tablename__ = "time_logs"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    developer_id = Column(Integer, ForeignKey("developers.id", ondelete="CASCADE"), nullable=False)
    date = Column(Date, nullable=False)
    hours = Column(Float, nullable=False)
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now_ist)

    task = relationship("Task", backref="time_logs")
    developer = relationship("Developer", backref="time_logs")


class Notification(Base):
    """In-app notifications for users (task assignments, status changes, etc.)."""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type = Column(String(50), default="info")  # task_assigned, status_changed, deadline_approaching, comment_added
    title = Column(String(200), nullable=False)
    message = Column(String(500), nullable=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=_now_ist)

    user = relationship("User", foreign_keys=[user_id])
    task = relationship("Task", foreign_keys=[task_id])


class TaskDependency(Base):
    """Task dependency: task_id is blocked by depends_on_id."""
    __tablename__ = "task_dependencies"
    __table_args__ = (
        UniqueConstraint("task_id", "depends_on_id", name="uq_task_dependency"),
    )

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    depends_on_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now_ist)

    task = relationship("Task", foreign_keys=[task_id], backref="dependencies")
    depends_on = relationship("Task", foreign_keys=[depends_on_id])


class KBArticle(Base):
    """Knowledge Base article — markdown content optionally linked to a project."""
    __tablename__ = "kb_articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(300), nullable=False)
    content = Column(Text, nullable=True)
    category = Column(String(100), nullable=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True)
    visibility = Column(String(20), nullable=False, default="global")  # "global" or "personal"
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    updated_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now_ist)
    updated_at = Column(DateTime(timezone=True), nullable=True, onupdate=_now_ist)

    project = relationship("Project", foreign_keys=[project_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])
    attachments = relationship("KBAttachment", back_populates="article", cascade="all, delete-orphan")


class KBAttachment(Base):
    """File attachment for a KB article, stored in Azure Blob Storage."""
    __tablename__ = "kb_attachments"

    id = Column(Integer, primary_key=True, index=True)
    article_id = Column(Integer, ForeignKey("kb_articles.id", ondelete="CASCADE"), nullable=False)
    file_name = Column(String(255), nullable=False)
    blob_url = Column(String(500), nullable=False)
    content_type = Column(String(100), default="application/octet-stream")
    file_size = Column(Integer, default=0)
    uploaded_at = Column(DateTime(timezone=True), default=_now_ist)

    article = relationship("KBArticle", back_populates="attachments")


class AuditLog(Base):
    """Audit trail — logs every create, update, and delete action in the system."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    user_name = Column(String(200))
    action = Column(String(20))  # CREATE, UPDATE, DELETE
    entity_type = Column(String(50))  # Task, Project, Developer, User, KBArticle, Sprint, etc.
    entity_id = Column(Integer)
    entity_label = Column(String(300))  # human-readable label
    changes = Column(Text, nullable=True)  # JSON string of changes
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True))

    user = relationship("User", foreign_keys=[user_id])
