from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def uid() -> str:
    return str(uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Team(Base):
    __tablename__ = "wework_teams"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    topology: Mapped[str] = mapped_column(String(32), default="roundTable")
    version: Mapped[int] = mapped_column(Integer, default=1)
    default_runtime_profile_id: Mapped[str | None] = mapped_column(
        ForeignKey("wework_runtime_profiles.id", ondelete="SET NULL"), nullable=True
    )
    team_messages: Mapped[list] = mapped_column(JSON, default=list)
    workspace_assignment: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    employees: Mapped[list["Employee"]] = relationship(back_populates="team", cascade="all, delete-orphan", order_by="Employee.created_at")
    works: Mapped[list["Work"]] = relationship(back_populates="team", cascade="all, delete-orphan", order_by="Work.created_at")
    workflow: Mapped["Workflow | None"] = relationship(back_populates="team", cascade="all, delete-orphan", uselist=False)


class Employee(Base):
    __tablename__ = "wework_employees"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    team_id: Mapped[str] = mapped_column(ForeignKey("wework_teams.id", ondelete="CASCADE"), index=True)
    display_name: Mapped[str] = mapped_column(String(200))
    role_name: Mapped[str] = mapped_column(String(200), default="专职算法工程师")
    color: Mapped[str] = mapped_column(String(16), default="#0BA5EC")
    status: Mapped[str] = mapped_column(String(32), default="idle")
    runtime: Mapped[str] = mapped_column(String(32), default="Workspace")
    default_runtime_profile_id: Mapped[str | None] = mapped_column(
        ForeignKey("wework_runtime_profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_lead: Mapped[bool] = mapped_column(Boolean, default=False)
    skills: Mapped[list] = mapped_column(JSON, default=list)
    session_id: Mapped[str] = mapped_column(String(36), default=uid, unique=True)
    context_ratio: Mapped[int] = mapped_column(Integer, default=0)
    metrics: Mapped[list] = mapped_column(JSON, default=list)
    workspace_assignment: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    team: Mapped[Team] = relationship(back_populates="employees")
    messages: Mapped[list["Message"]] = relationship(back_populates="employee", cascade="all, delete-orphan", order_by="Message.created_at")
    artifacts: Mapped[list["Artifact"]] = relationship(back_populates="employee", cascade="all, delete-orphan", order_by="Artifact.created_at")
    works: Mapped[list["Work"]] = relationship(back_populates="employee")


class Work(Base):
    __tablename__ = "wework_works"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    team_id: Mapped[str] = mapped_column(ForeignKey("wework_teams.id", ondelete="CASCADE"), index=True)
    assigned_employee_id: Mapped[str | None] = mapped_column(ForeignKey("wework_employees.id", ondelete="SET NULL"), nullable=True, index=True)
    runtime_profile_id: Mapped[str | None] = mapped_column(
        ForeignKey("wework_runtime_profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(300))
    goal: Mapped[str] = mapped_column(Text, default="")
    constraints: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    priority: Mapped[str] = mapped_column(String(16), default="medium")
    category: Mapped[str] = mapped_column(String(32), default="Digital")
    queue_position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    team: Mapped[Team] = relationship(back_populates="works")
    employee: Mapped[Employee | None] = relationship(back_populates="works")


class Message(Base):
    __tablename__ = "wework_messages"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    employee_id: Mapped[str] = mapped_column(ForeignKey("wework_employees.id", ondelete="CASCADE"), index=True)
    sender: Mapped[str] = mapped_column(String(16))
    sender_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    employee: Mapped[Employee] = relationship(back_populates="messages")


class Artifact(Base):
    __tablename__ = "wework_artifacts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    employee_id: Mapped[str] = mapped_column(ForeignKey("wework_employees.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(300))
    type: Mapped[str] = mapped_column(String(32), default="data")
    content_type: Mapped[str] = mapped_column(String(200), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    storage_key: Mapped[str] = mapped_column(String(600), unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    employee: Mapped[Employee] = relationship(back_populates="artifacts")


class Workflow(Base):
    __tablename__ = "wework_workflows"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    team_id: Mapped[str] = mapped_column(ForeignKey("wework_teams.id", ondelete="CASCADE"), unique=True)
    name: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    version: Mapped[int] = mapped_column(Integer, default=1)
    nodes: Mapped[list] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    team: Mapped[Team] = relationship(back_populates="workflow")


class Event(Base):
    __tablename__ = "wework_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    type: Mapped[str] = mapped_column(String(100), index=True)
    aggregate_id: Mapped[str] = mapped_column(String(36), index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RuntimeProfile(Base):
    __tablename__ = "wework_runtime_profiles"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    adapter: Mapped[str] = mapped_column(String(50), index=True)
    model_config: Mapped[dict] = mapped_column(JSON)
    system_prompt: Mapped[str] = mapped_column(Text, default="")
    thinking_level: Mapped[str] = mapped_column(String(20), default="off")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class RuntimeSession(Base):
    __tablename__ = "wework_runtime_sessions"
    __table_args__ = (
        UniqueConstraint("employee_id", "runtime_profile_id", name="uq_runtime_employee_profile"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    employee_id: Mapped[str] = mapped_column(ForeignKey("wework_employees.id", ondelete="CASCADE"), index=True)
    runtime_profile_id: Mapped[str] = mapped_column(ForeignKey("wework_runtime_profiles.id", ondelete="CASCADE"), index=True)
    native_session_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    messages: Mapped[list] = mapped_column(JSON, default=list)
    usage: Mapped[dict] = mapped_column(JSON, default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class RuntimeRun(Base):
    __tablename__ = "wework_runtime_runs"
    __table_args__ = (UniqueConstraint("work_id", "attempt", name="uq_runtime_work_attempt"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    work_id: Mapped[str] = mapped_column(ForeignKey("wework_works.id", ondelete="CASCADE"), index=True)
    employee_id: Mapped[str] = mapped_column(ForeignKey("wework_employees.id", ondelete="CASCADE"), index=True)
    runtime_profile_id: Mapped[str | None] = mapped_column(
        ForeignKey("wework_runtime_profiles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    runtime_session_id: Mapped[str | None] = mapped_column(
        ForeignKey("wework_runtime_sessions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    runtime: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32), default="queued")
    attempt: Mapped[int] = mapped_column(Integer, default=1)
    external_run_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
