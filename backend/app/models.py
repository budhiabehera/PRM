from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Date, ForeignKey, Text, DateTime, Table, UniqueConstraint, Index
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
    "PRM_user_projects", Base.metadata,
    Column("user_id", Integer, ForeignKey("PRM_users.id", ondelete="CASCADE"), primary_key=True),
    Column("project_id", Integer, ForeignKey("PRM_projects.id", ondelete="CASCADE"), primary_key=True),
)

# Many-to-many: Developers <-> Projects
developer_projects = Table(
    "PRM_developer_projects", Base.metadata,
    Column("developer_id", Integer, ForeignKey("PRM_developers.id", ondelete="CASCADE"), primary_key=True),
    Column("project_id", Integer, ForeignKey("PRM_projects.id", ondelete="CASCADE"), primary_key=True),
)


class IntegrationSettings(Base):
    """Singleton row (id=1) holding external integration configuration.
    Editable only by Admins via Admin > Settings."""
    __tablename__ = "PRM_integration_settings"

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

    # Configurable defaults & operational settings
    default_password = Column(String(100), default="Ids@1001")
    default_role = Column(String(50), default="Developer")
    default_skill = Column(String(50), default="Backend")
    daily_hours_threshold = Column(Float, default=8.0)
    hours_check_time = Column(String(10), default="22:00")
    management_excluded_roles = Column(Text, default="SVP-Product,AVP-Product,Product Manager")

class User(Base):
    """Login account. Roles: Admin, Manager, Lead, Developer.
    Optionally linked to a Developer record (so a Lead/Developer's task
    permissions can be scoped to "their own" tasks/module)."""
    __tablename__ = "PRM_users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(150), nullable=True)
    full_name = Column(String(150), nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="Developer")  # Admin, Manager, Lead, Developer
    developer_id = Column(Integer, ForeignKey("PRM_developers.id"), nullable=True, index=True)
    active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), default=_now_ist)

    developer = relationship("Developer", back_populates="user_account")
    projects = relationship("Project", secondary=user_projects, backref="users")


class UserPreference(Base):
    """Key-value preferences per user (e.g., default_project, default_sprint, theme)."""
    __tablename__ = "PRM_user_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("PRM_users.id"), nullable=False)
    key = Column(String(100), nullable=False)
    value = Column(Text, nullable=True)  # JSON-encoded value
    created_at = Column(DateTime(timezone=True), default=_now_ist)
    updated_at = Column(DateTime(timezone=True), default=_now_ist, onupdate=_now_ist)

    user = relationship("User", backref="preferences")

    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_user_pref_key"),)


class FilterPreset(Base):
    """Named saved filter views per user per page."""
    __tablename__ = "PRM_filter_presets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("PRM_users.id"), nullable=False)
    name = Column(String(100), nullable=False)
    page = Column(String(50), nullable=False)  # 'dashboard', 'tasks', 'utilization'
    filters = Column(Text, nullable=False)  # JSON-encoded filter state
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=_now_ist)
    updated_at = Column(DateTime(timezone=True), default=_now_ist, onupdate=_now_ist)

    user = relationship("User", backref="filter_presets")


class MainModule(Base):
    __tablename__ = "PRM_main_modules"
    __table_args__ = (UniqueConstraint('name', 'project_id', name='uq_module_name_project'),)

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(255), default="")
    project_id = Column(Integer, ForeignKey("PRM_projects.id"), nullable=True, index=True)

    sub_modules = relationship("SubModule", back_populates="main_module", cascade="all, delete-orphan")
    project = relationship("Project", back_populates="modules", foreign_keys=[project_id])
    developers = relationship("Developer", back_populates="home_module")
    tasks = relationship("Task", back_populates="main_module")


class SubModule(Base):
    __tablename__ = "PRM_sub_modules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    main_module_id = Column(Integer, ForeignKey("PRM_main_modules.id"), nullable=False)

    main_module = relationship("MainModule", back_populates="sub_modules")
    tasks = relationship("Task", back_populates="sub_module")


class Project(Base):
    __tablename__ = "PRM_projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    code = Column(String(50), unique=True, nullable=False)
    main_module_id = Column(Integer, ForeignKey("PRM_main_modules.id"), nullable=True)
    status = Column(String(30), default="Active")  # Active, Inactive, Planning, Completed
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    description = Column(Text, default="")
    hours_check_enabled = Column(Boolean, default=False)  # Enable daily hours email check for this project

    modules = relationship("MainModule", back_populates="project", foreign_keys="[MainModule.project_id]")
    tasks = relationship("Task", back_populates="project")


class Developer(Base):
    __tablename__ = "PRM_developers"

    id = Column(Integer, primary_key=True, index=True)
    dev_code = Column(String(20), unique=True, nullable=False)  # e.g. DEV001
    name = Column(String(150), nullable=False)
    role = Column(String(50), default="Developer")  # Manager, Lead - Manager, Lead, Developer
    home_module_id = Column(Integer, ForeignKey("PRM_main_modules.id"), nullable=True, index=True)
    skill = Column(String(50), default="Backend")  # Backend, Frontend, Mobile
    base_capacity = Column(Float, default=192)  # hrs/month
    active = Column(Boolean, default=True)
    reporting_to_id = Column(Integer, ForeignKey("PRM_developers.id"), nullable=True)

    home_module = relationship("MainModule", back_populates="developers")
    projects = relationship("Project", secondary=developer_projects, backref="assigned_developers")
    tasks = relationship("Task", back_populates="developer", foreign_keys="[Task.developer_id]")
    availabilities = relationship("Availability", back_populates="developer", cascade="all, delete-orphan")
    user_account = relationship("User", back_populates="developer", uselist=False)
    reporting_to = relationship("Developer", remote_side=[id], foreign_keys=[reporting_to_id])


class Skill(Base):
    __tablename__ = "PRM_skills"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(String(255), default="")


class WorkType(Base):
    __tablename__ = "PRM_work_types"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    customer_committed = Column(Boolean, default=False)
    color = Column(String(20), default="#4f46e5")

    tasks = relationship("Task", back_populates="work_type")


class Sprint(Base):
    __tablename__ = "PRM_sprints"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(30), unique=True, nullable=False)  # e.g. Jul-2026
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    status = Column(String(30), default="Not Started")  # Not Started, Planned, Active, Completed
    project_id = Column(Integer, ForeignKey("PRM_projects.id"), nullable=True)

    project = relationship("Project")
    tasks = relationship("Task", back_populates="sprint")


class Task(Base):
    __tablename__ = "PRM_tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_code = Column(String(20), unique=True, nullable=False)  # e.g. T09001
    case_ref = Column(String(100), default="")
    subject = Column(String(255), default="")
    point_of_contact = Column(String(150), default="")
    property_client = Column(String(150), default="")
    description = Column(Text, nullable=False)

    project_id = Column(Integer, ForeignKey("PRM_projects.id"), nullable=True, index=True)
    main_module_id = Column(Integer, ForeignKey("PRM_main_modules.id"), nullable=True, index=True)
    sub_module_id = Column(Integer, ForeignKey("PRM_sub_modules.id"), nullable=True, index=True)
    developer_id = Column(Integer, ForeignKey("PRM_developers.id"), nullable=True, index=True)
    work_type_id = Column(Integer, ForeignKey("PRM_work_types.id"), nullable=True, index=True)
    sprint_id = Column(Integer, ForeignKey("PRM_sprints.id"), nullable=True, index=True)
    reporting_to_id = Column(Integer, ForeignKey("PRM_developers.id"), nullable=True)
    repository_id = Column(Integer, ForeignKey("PRM_repositories.id"), nullable=True, index=True)

    priority = Column(String(20), default="Medium")  # Critical, High, Medium, Low
    status = Column(String(30), default="Not Started")
    customer_committed = Column(Boolean, default=False)
    team = Column(String(100), nullable=True)  # e.g. Backend, Frontend, QA, DevOps

    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    estimated_hours = Column(Float, default=0)
    actual_hours = Column(Float, default=0)

    percentage = Column(Float, default=0)  # task completion % (updated from activity log)

    __table_args__ = (
        Index("ix_prm_tasks_status", "status"),
        Index("ix_prm_tasks_sprint_dev", "sprint_id", "developer_id"),
        Index("ix_prm_tasks_sprint_status", "sprint_id", "status"),
        Index("ix_prm_tasks_project_status", "project_id", "status"),
    )

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
    developer = relationship("Developer", back_populates="tasks", foreign_keys=[developer_id])
    reporting_to = relationship("Developer", foreign_keys=[reporting_to_id])
    work_type = relationship("WorkType", back_populates="tasks")
    sprint = relationship("Sprint", back_populates="tasks")
    repository = relationship("Repository", backref="tasks")

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
    __tablename__ = "PRM_availabilities"

    id = Column(Integer, primary_key=True, index=True)
    developer_id = Column(Integer, ForeignKey("PRM_developers.id"), nullable=False, index=True)
    sprint_id = Column(Integer, ForeignKey("PRM_sprints.id"), nullable=False, index=True)
    leave_days = Column(Float, default=0)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    notes = Column(String(255), default="")

    developer = relationship("Developer", back_populates="availabilities")
    sprint = relationship("Sprint")

    __table_args__ = (
        Index("ix_prm_avail_dev_sprint", "developer_id", "sprint_id"),
    )


class TaskActivity(Base):
    """Daily activity log entries for a task — captures what was done each day."""
    __tablename__ = "PRM_task_activities"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("PRM_tasks.id"), nullable=False, index=True)
    developer_id = Column(Integer, ForeignKey("PRM_developers.id"), nullable=True)
    activity_date = Column(Date, nullable=False)
    description = Column(Text, nullable=False)
    hours_spent = Column(Float, default=0)
    percentage = Column(Float, default=0)  # task % completion at this point
    created_at = Column(DateTime(timezone=True), default=_now_ist)
    created_by_id = Column(Integer, ForeignKey("PRM_users.id"), nullable=True)

    task = relationship("Task", backref="activities")
    developer = relationship("Developer")
    created_by = relationship("User", foreign_keys=[created_by_id])


class TaskAttachment(Base):
    """File attachments stored in Azure Blob Storage for a task."""
    __tablename__ = "PRM_task_attachments"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("PRM_tasks.id"), nullable=False)
    file_name = Column(String(255), nullable=False)
    blob_name = Column(String(500), nullable=False)  # full blob path in container
    file_size = Column(Integer, default=0)  # bytes
    content_type = Column(String(100), default="application/octet-stream")
    created_by_id = Column(Integer, ForeignKey("PRM_users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now_ist)
    last_modified = Column(DateTime(timezone=True), default=_now_ist)

    task = relationship("Task", backref="attachments")
    created_by = relationship("User", foreign_keys=[created_by_id])


class Holiday(Base):
    """Company holidays. Weekends (Sat/Sun) are implicit; this stores
    additional declared holidays (e.g. national holidays, company days off)."""
    __tablename__ = "PRM_holidays"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, unique=True, nullable=False, index=True)
    name = Column(String(150), nullable=False)
    month = Column(Integer, nullable=False)  # 1-12, derived from date for fast filtering
    year = Column(Integer, nullable=False)   # e.g. 2026
    created_by_id = Column(Integer, ForeignKey("PRM_users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now_ist)

    created_by = relationship("User", foreign_keys=[created_by_id])


class RoleCapacity(Base):
    """Defines default capacity (hours/month) per role.
    Used to auto-fill base_capacity in User Setup when a role is selected."""
    __tablename__ = "PRM_role_capacities"

    id = Column(Integer, primary_key=True, index=True)
    role = Column(String(50), unique=True, nullable=False)  # e.g. Admin, Manager, Lead, Developer
    capacity_hours = Column(Float, nullable=False, default=192)  # hrs/month
    description = Column(String(255), default="")
    created_at = Column(DateTime(timezone=True), default=_now_ist)


class TaskStatus(Base):
    """User-defined task statuses (e.g., Not Started, In Progress, etc.)."""
    __tablename__ = "PRM_task_statuses"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    color = Column(String(20), default="#4f46e5")
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=_now_ist)


class PageAccess(Base):
    """Controls which roles can see which pages/menu items."""
    __tablename__ = "PRM_page_access"

    id = Column(Integer, primary_key=True, index=True)
    page_key = Column(String(100), nullable=False)   # e.g. '/tasks', '/admin/projects'
    page_label = Column(String(100), nullable=False)  # e.g. 'Tasks', 'Projects'
    section = Column(String(50), default="overview")  # overview, admin, reports
    roles = Column(String(500), nullable=False)       # comma-separated: "Admin,Manager,Lead,Developer"
    created_at = Column(DateTime(timezone=True), default=_now_ist)


class TimeLog(Base):
    """Time logging entries — developers log hours against tasks per day."""
    __tablename__ = "PRM_time_logs"

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("PRM_tasks.id"), nullable=False)
    developer_id = Column(Integer, ForeignKey("PRM_developers.id"), nullable=False)
    date = Column(Date, nullable=False)
    hours = Column(Float, nullable=False)
    notes = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now_ist)

    task = relationship("Task", backref="time_logs")
    developer = relationship("Developer", backref="time_logs")


class Notification(Base):
    """In-app notifications for users (task assignments, status changes, etc.)."""
    __tablename__ = "PRM_notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("PRM_users.id"), nullable=False)
    type = Column(String(50), default="info")  # task_assigned, status_changed, deadline_approaching, comment_added
    title = Column(String(200), nullable=False)
    message = Column(String(500), nullable=True)
    task_id = Column(Integer, ForeignKey("PRM_tasks.id"), nullable=True)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=_now_ist)

    user = relationship("User", foreign_keys=[user_id])
    task = relationship("Task", foreign_keys=[task_id])


class TaskDependency(Base):
    """Task dependency: task_id is blocked by depends_on_id."""
    __tablename__ = "PRM_task_dependencies"
    __table_args__ = (
        UniqueConstraint("task_id", "depends_on_id", name="uq_task_dependency"),
    )

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("PRM_tasks.id"), nullable=False)
    depends_on_id = Column(Integer, ForeignKey("PRM_tasks.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now_ist)

    task = relationship("Task", foreign_keys=[task_id], backref="dependencies")
    depends_on = relationship("Task", foreign_keys=[depends_on_id])


class KBArticle(Base):
    """Knowledge Base article — markdown content optionally linked to a project."""
    __tablename__ = "PRM_kb_articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(300), nullable=False)
    content = Column(Text, nullable=True)
    category = Column(String(100), nullable=True)
    project_id = Column(Integer, ForeignKey("PRM_projects.id"), nullable=True)
    visibility = Column(String(20), nullable=False, default="global")  # "global" or "personal"
    created_by_id = Column(Integer, ForeignKey("PRM_users.id"), nullable=False)
    updated_by_id = Column(Integer, ForeignKey("PRM_users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now_ist)
    updated_at = Column(DateTime(timezone=True), nullable=True, onupdate=_now_ist)

    project = relationship("Project", foreign_keys=[project_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    updated_by = relationship("User", foreign_keys=[updated_by_id])
    attachments = relationship("KBAttachment", back_populates="article", cascade="all, delete-orphan")



class KBAttachment(Base):
    """File attachment for a KB article, stored in Azure Blob Storage."""
    __tablename__ = "PRM_kb_attachments"

    id = Column(Integer, primary_key=True, index=True)
    article_id = Column(Integer, ForeignKey("PRM_kb_articles.id"), nullable=False)
    file_name = Column(String(255), nullable=False)
    blob_url = Column(String(500), nullable=False)
    content_type = Column(String(100), default="application/octet-stream")
    file_size = Column(Integer, default=0)
    uploaded_at = Column(DateTime(timezone=True), default=_now_ist)

    article = relationship("KBArticle", back_populates="attachments")


class KBCategory(Base):
    """Master table for Knowledge Base article categories."""
    __tablename__ = "PRM_kb_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    project_id = Column(Integer, ForeignKey("PRM_projects.id"), nullable=True, index=True)
    color = Column(String(20), default="#4f46e5")
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=_now_ist)

    project = relationship("Project")


class AuditLog(Base):
    """Audit trail — logs every create, update, and delete action in the system."""
    __tablename__ = "PRM_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("PRM_users.id"), nullable=True)
    user_name = Column(String(200))
    action = Column(String(20))  # CREATE, UPDATE, DELETE
    entity_type = Column(String(50))  # Task, Project, Developer, User, KBArticle, Sprint, etc.
    entity_id = Column(Integer)
    entity_label = Column(String(300))  # human-readable label
    changes = Column(Text, nullable=True)  # JSON string of changes
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True))

    user = relationship("User", foreign_keys=[user_id])


# ─── Engineering / Bitbucket Models ───────────────────────────────────

class BitbucketSettings(Base):
    __tablename__ = "PRM_bitbucket_settings"

    id = Column(Integer, primary_key=True)
    platform = Column(String(20), default="cloud")
    base_url = Column(String(500), nullable=True)
    workspace_slug = Column(String(100), nullable=True)
    auth_type = Column(String(20), default="app_password")
    auth_username = Column(String(100), nullable=True)
    auth_token = Column(String(500), nullable=True)
    webhook_secret = Column(String(100), nullable=True)
    sync_enabled = Column(Boolean, default=True)
    sync_interval = Column(Integer, default=15)
    last_synced_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())


class Repository(Base):
    __tablename__ = "PRM_repositories"
    __table_args__ = (UniqueConstraint("repo_slug", "project_id", name="uq_repo_slug"),)

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("PRM_projects.id"), nullable=False, index=True)
    repo_slug = Column(String(200), nullable=False)
    repo_name = Column(String(200))
    repo_full_name = Column(String(400))
    default_branch = Column(String(100), default="main")
    language = Column(String(50), nullable=True)
    active = Column(Boolean, default=True)
    last_synced_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())

    project = relationship("Project", backref="repositories")


class Commit(Base):
    __tablename__ = "PRM_commits"
    __table_args__ = (UniqueConstraint("repo_id", "commit_hash", name="uq_commit_hash"),)

    id = Column(Integer, primary_key=True, index=True)
    repo_id = Column(Integer, ForeignKey("PRM_repositories.id"), nullable=False, index=True)
    commit_hash = Column(String(40), nullable=False)
    short_hash = Column(String(12))
    author_name = Column(String(200))
    author_email = Column(String(200))
    developer_id = Column(Integer, ForeignKey("PRM_developers.id"), nullable=True, index=True)
    message = Column(Text)
    branch = Column(String(200))
    committed_at = Column(DateTime, nullable=False)
    additions = Column(Integer, default=0)
    deletions = Column(Integer, default=0)
    files_changed = Column(Integer, default=0)
    task_id = Column(Integer, ForeignKey("PRM_tasks.id"), nullable=True, index=True)
    created_at = Column(DateTime, default=func.now())

    repo = relationship("Repository", backref="commits")
    developer = relationship("Developer")
    task = relationship("Task")


class PullRequest(Base):
    __tablename__ = "PRM_pull_requests"
    __table_args__ = (UniqueConstraint("repo_id", "pr_number", name="uq_pr_number"),)

    id = Column(Integer, primary_key=True, index=True)
    repo_id = Column(Integer, ForeignKey("PRM_repositories.id"), nullable=False, index=True)
    pr_number = Column(Integer, nullable=False)
    title = Column(String(500))
    description = Column(Text)
    author_name = Column(String(200))
    author_email = Column(String(200))
    developer_id = Column(Integer, ForeignKey("PRM_developers.id"), nullable=True, index=True)
    source_branch = Column(String(200))
    dest_branch = Column(String(200))
    status = Column(String(20), nullable=False)  # OPEN, MERGED, DECLINED, SUPERSEDED
    commit_count = Column(Integer, default=0)
    comment_count = Column(Integer, default=0)
    task_id = Column(Integer, ForeignKey("PRM_tasks.id"), nullable=True, index=True)
    created_at_bb = Column(DateTime)
    updated_at_bb = Column(DateTime)
    merged_at = Column(DateTime, nullable=True)
    merge_duration_hr = Column(Float, nullable=True)
    created_at = Column(DateTime, default=func.now())

    repo = relationship("Repository", backref="pull_requests")
    developer = relationship("Developer")
    task = relationship("Task")
    reviewers = relationship("PRReviewer", back_populates="pull_request")


class PRReviewer(Base):
    __tablename__ = "PRM_pr_reviewers"
    __table_args__ = (UniqueConstraint("pr_id", "reviewer_email", name="uq_pr_reviewer"),)

    id = Column(Integer, primary_key=True, index=True)
    pr_id = Column(Integer, ForeignKey("PRM_pull_requests.id"), nullable=False, index=True)
    reviewer_name = Column(String(200))
    reviewer_email = Column(String(200))
    developer_id = Column(Integer, ForeignKey("PRM_developers.id"), nullable=True, index=True)
    status = Column(String(20), default="PENDING")
    reviewed_at = Column(DateTime, nullable=True)
    review_duration_hr = Column(Float, nullable=True)
    comments_count = Column(Integer, default=0)

    pull_request = relationship("PullRequest", back_populates="reviewers")
    developer = relationship("Developer")


class Release(Base):
    __tablename__ = "PRM_releases"
    __table_args__ = (UniqueConstraint("repo_id", "tag_name", name="uq_release_tag"),)

    id = Column(Integer, primary_key=True, index=True)
    repo_id = Column(Integer, ForeignKey("PRM_repositories.id"), nullable=False, index=True)
    tag_name = Column(String(100), nullable=False)
    release_name = Column(String(200))
    description = Column(Text)
    author_name = Column(String(200))
    commit_hash = Column(String(40))
    commit_count = Column(Integer, default=0)
    pr_count = Column(Integer, default=0)
    released_at = Column(DateTime, nullable=True)
    days_since_prev = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=func.now())

    repo = relationship("Repository", backref="releases")


# ─── Alert Engine Models ─────────────────────────────────────────────

class AlertRule(Base):
    """Configurable alert rules for engineering notifications."""
    __tablename__ = "PRM_alert_rules"

    id = Column(Integer, primary_key=True, index=True)
    rule_type = Column(String(50), nullable=False)  # pr_review_pending, task_no_activity, task_overdue, sprint_delay
    name = Column(String(200), nullable=False)
    description = Column(String(500), nullable=True)
    threshold = Column(Integer, nullable=False)  # hours for PR, days for tasks, percentage for sprint
    enabled = Column(Boolean, default=True)
    severity = Column(String(20), default="warning")  # info, warning, critical
    notify_in_app = Column(Boolean, default=True)
    notify_email = Column(Boolean, default=False)
    notify_teams = Column(Boolean, default=False)
    project_id = Column(Integer, ForeignKey("PRM_projects.id"), nullable=True)  # null = all projects
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())

    project = relationship("Project")


class AlertHistory(Base):
    """Log of triggered alerts — tracks when alerts fired and resolved."""
    __tablename__ = "PRM_alert_history"

    id = Column(Integer, primary_key=True, index=True)
    rule_id = Column(Integer, ForeignKey("PRM_alert_rules.id"), nullable=False, index=True)
    rule_type = Column(String(50))
    severity = Column(String(20))
    title = Column(String(200))
    message = Column(String(500))
    entity_type = Column(String(50))  # "Task", "PullRequest", "Sprint"
    entity_id = Column(Integer, nullable=True)
    entity_label = Column(String(100), nullable=True)  # e.g. task_code, PR #number
    resolved = Column(Boolean, default=False)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now())

    rule = relationship("AlertRule")

class RoleDataScope(Base):
    """Defines data visibility scope per role: self_only, team, or full."""
    __tablename__ = "PRM_role_data_scope"

    id = Column(Integer, primary_key=True, index=True)
    role = Column(String(100), nullable=False, unique=True)
    data_scope = Column(String(20), nullable=False, default="self_only")  # self_only | team | full
    created_at = Column(DateTime(timezone=True), default=_now_ist)

class OrgHierarchy(Base):
    """Project-level org hierarchy — who reports to whom within a project."""
    __tablename__ = "PRM_org_hierarchy"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(Integer, ForeignKey("PRM_projects.id"), nullable=False, index=True)
    developer_id = Column(Integer, ForeignKey("PRM_developers.id"), nullable=False, index=True)
    reports_to_id = Column(Integer, ForeignKey("PRM_developers.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), default=_now_ist)

    project = relationship("Project", backref="org_hierarchy")
    developer = relationship("Developer", foreign_keys=[developer_id], backref="org_hierarchy_entries")
    reports_to = relationship("Developer", foreign_keys=[reports_to_id])


class PageAccessAudit(Base):
    """Audit trail for Page Access & Data Scope changes. Stores full snapshot before each save."""
    __tablename__ = "PRM_page_access_audit"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String(30), nullable=False)  # "page_access_save", "data_scope_save"
    changed_by = Column(String(100), nullable=False)  # username
    changed_at = Column(DateTime(timezone=True), default=_now_ist)
    snapshot_before = Column(Text, nullable=False)  # JSON snapshot of data BEFORE the change
    snapshot_after = Column(Text, nullable=False)   # JSON snapshot of data AFTER the change
    summary = Column(String(500), default="")       # Human-readable diff summary
