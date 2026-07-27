from sqlalchemy import (
    Column, Integer, String, Float, Boolean, Date, ForeignKey, Text
)
from sqlalchemy.orm import relationship
from .database import Base


class MainModule(Base):
    __tablename__ = "main_modules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(String(255), default="")

    sub_modules = relationship("SubModule", back_populates="main_module", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="main_module")
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

    main_module = relationship("MainModule", back_populates="projects")
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

    home_module = relationship("MainModule", back_populates="developers")
    tasks = relationship("Task", back_populates="developer")
    availabilities = relationship("Availability", back_populates="developer", cascade="all, delete-orphan")


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

    tasks = relationship("Task", back_populates="sprint")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_code = Column(String(20), unique=True, nullable=False)  # e.g. T09001
    case_ref = Column(String(100), default="")
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

    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    estimated_hours = Column(Float, default=0)
    actual_hours = Column(Float, default=0)

    project = relationship("Project", back_populates="tasks")
    main_module = relationship("MainModule", back_populates="tasks")
    sub_module = relationship("SubModule", back_populates="tasks")
    developer = relationship("Developer", back_populates="tasks")
    work_type = relationship("WorkType", back_populates="tasks")
    sprint = relationship("Sprint", back_populates="tasks")

    @property
    def percent_complete(self):
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
    notes = Column(String(255), default="")

    developer = relationship("Developer", back_populates="availabilities")
    sprint = relationship("Sprint")
