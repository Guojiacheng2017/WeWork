import asyncio
import json
import os
import re
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Query, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session, selectinload

from .database import Base, build_database, session_dependency
from .models import Artifact, Employee, Event, Message, RuntimeProfile, RuntimeRun, RuntimeSession, Team, Work, Workflow, uid, utcnow
from .schemas import AssignWork, BootstrapRequest, EmployeeCreate, EmployeeUpdate, LeadChange, MessageCreate, RuntimeComplete, RuntimeProfileCreate, RuntimeUpdate, TeamCreate, TeamMessageCreate, TeamWorkspaceUpdate, WorkCreate, WorkUpdate, WorkflowSave, normalize_model_config, normalize_workspace_assignment
from .storage import LocalArtifactStorage, S3ArtifactStorage


def iso(value: datetime) -> str:
    return value.isoformat()


def display_time(value: datetime) -> str:
    return value.astimezone().strftime("%H:%M")


def resolve_event_cursor(after: int, last_event_id: str | None) -> int:
    try:
        return max(after, int(last_event_id)) if last_event_id is not None else after
    except ValueError:
        return after


def work_dict(work: Work) -> dict:
    return {"id": work.id, "title": work.title, "goal": work.goal, "constraints": work.constraints,
            "status": work.status, "assignedEmployeeId": work.assigned_employee_id, "priority": work.priority,
            "category": work.category, "runtimeProfileId": work.runtime_profile_id,
            "createdAt": iso(work.created_at)}


def message_dict(message: Message) -> dict:
    return {"id": message.id, "sender": message.sender, "senderName": message.sender_name,
            "text": message.text, "time": display_time(message.created_at)}


def artifact_dict(artifact: Artifact) -> dict:
    return {"id": artifact.id, "name": artifact.name, "type": artifact.type,
            "size": f"{artifact.size_bytes} B", "createdAt": display_time(artifact.created_at),
            "description": artifact.description, "storageKey": artifact.storage_key}


def immutable_id(value: str, kind: str) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,127}", value):
        raise ValueError(f"invalid immutable {kind} id")
    return value


def employee_dict(employee: Employee) -> dict:
    works = sorted(employee.works, key=lambda item: (item.queue_position or 0, item.created_at))
    current = next((item for item in works if item.status == "running"), None)
    queued = [work_dict(item) for item in works if item.status == "pending" and item.assigned_employee_id]
    completed = [work_dict(item) for item in works if item.status == "completed"]
    result = {
        "id": immutable_id(employee.id, "employee"), "displayName": employee.display_name, "roleName": employee.role_name, "color": employee.color,
        "status": employee.status, "isLead": employee.is_lead, "runtime": employee.runtime, "builtInSkills": employee.skills,
        "defaultRuntimeProfileId": employee.default_runtime_profile_id,
        "activeSession": {"id": employee.session_id, "contextRatio": employee.context_ratio,
                          "updatedAt": iso(employee.created_at), "messages": [message_dict(m) for m in employee.messages],
                          "metrics": employee.metrics},
        "artifacts": [artifact_dict(a) for a in employee.artifacts],
        "currentWorkItem": work_dict(current) if current else None,
        "queuedWorkItems": queued, "completedWorkItems": completed,
    }
    if employee.workspace_assignment is not None:
        result["workspaceAssignment"] = normalize_workspace_assignment(employee.workspace_assignment)
    return result


def team_dict(team: Team) -> dict:
    workflow = None
    if team.workflow:
        workflow = {"id": team.workflow.id, "name": team.workflow.name,
                    "description": team.workflow.description, "nodes": team.workflow.nodes,
                    "version": team.workflow.version}
    result = {"id": immutable_id(team.id, "team"), "name": team.name, "description": team.description, "topology": team.topology,
            "defaultRuntimeProfileId": team.default_runtime_profile_id,
            "version": team.version, "employees": [employee_dict(employee) for employee in team.employees],
            "pendingWorks": [work_dict(work) for work in team.works if work.status == "pending" and not work.assigned_employee_id],
            "teamMessages": team.team_messages,
            "workflow": workflow}
    if team.workspace_assignment is not None:
        result["workspaceAssignment"] = normalize_workspace_assignment(team.workspace_assignment)
    return result


def workflow_dict(workflow: Workflow) -> dict:
    return {"id": workflow.id, "name": workflow.name, "description": workflow.description,
            "nodes": workflow.nodes, "version": workflow.version}


def runtime_profile_dict(profile: RuntimeProfile) -> dict:
    try:
        model_config = normalize_model_config(profile.model_config)
    except Exception as error:
        raise HTTPException(500, "invalid persisted runtime profile") from error
    return {
        "id": profile.id, "name": profile.name, "adapter": profile.adapter,
        "model": model_config, "systemPrompt": profile.system_prompt,
        "thinkingLevel": profile.thinking_level, "enabled": profile.enabled,
        "createdAt": iso(profile.created_at), "updatedAt": iso(profile.updated_at),
    }


def emit(session: Session, event_type: str, aggregate_id: str, payload: dict) -> None:
    session.add(Event(type=event_type, aggregate_id=aggregate_id, payload=payload))


def validate_workflow(body: WorkflowSave) -> None:
    ids = {node.id for node in body.nodes}
    if len(ids) != len(body.nodes) or any(req not in ids for node in body.nodes for req in node.requires):
        raise HTTPException(422, "workflow contains unknown or duplicate node ids")
    graph = {node.id: node.requires for node in body.nodes}
    visiting, visited = set(), set()
    def visit(node_id: str):
        if node_id in visiting:
            raise HTTPException(422, "workflow cycle detected")
        if node_id in visited:
            return
        visiting.add(node_id)
        for required in graph[node_id]:
            visit(required)
        visiting.remove(node_id)
        visited.add(node_id)
    for node_id in graph:
        visit(node_id)


def create_app(database_url: str | None = None, artifact_root: Path | None = None) -> FastAPI:
    database_url = database_url or os.getenv("DATABASE_URL", "sqlite:///./data/wework.db")
    engine, factory = build_database(database_url)
    storage = S3ArtifactStorage() if os.getenv("S3_BUCKET") else LocalArtifactStorage(artifact_root or Path(os.getenv("ARTIFACT_ROOT", "./data/artifacts")))

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        Base.metadata.create_all(engine)
        yield
        engine.dispose()

    app = FastAPI(title="WeWork Server", version="0.1.0", lifespan=lifespan)
    origins = [item.strip() for item in os.getenv("CORS_ORIGINS", "http://127.0.0.1:5173,http://localhost:5173").split(",") if item.strip()]
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"], expose_headers=["ETag"])

    def db():
        yield from session_dependency(factory)

    def internal_auth(x_wework_internal_token: str | None = Header(None)):
        expected = os.getenv("WEWORK_INTERNAL_TOKEN")
        if expected and x_wework_internal_token != expected:
            raise HTTPException(401, "invalid internal token")

    def get_team(session: Session, team_id: str) -> Team:
        team = session.get(Team, team_id)
        if not team:
            raise HTTPException(404, "team not found")
        return team

    def get_employee(session: Session, employee_id: str) -> Employee:
        employee = session.get(Employee, employee_id)
        if not employee:
            raise HTTPException(404, "employee not found")
        return employee

    def get_runtime_profile(session: Session, profile_id: str | None) -> RuntimeProfile | None:
        if not profile_id:
            return None
        profile = session.get(RuntimeProfile, profile_id)
        if not profile:
            raise HTTPException(422, "runtime profile not found")
        return profile

    @app.get("/health")
    def health():
        return {"ok": True, "service": "wework-server"}

    @app.get("/v1/wework")
    def snapshot(session: Session = Depends(db)):
        teams = session.scalars(select(Team).options(
            selectinload(Team.employees).selectinload(Employee.messages),
            selectinload(Team.employees).selectinload(Employee.artifacts),
            selectinload(Team.employees).selectinload(Employee.works),
            selectinload(Team.works), selectinload(Team.workflow),
        ).order_by(Team.created_at)).unique().all()
        latest = session.scalar(select(func.max(Event.id))) or 0
        return {"teams": [team_dict(team) for team in teams], "eventCursor": latest}

    @app.get("/v1/runtime-profiles")
    def list_runtime_profiles(session: Session = Depends(db)):
        profiles = session.scalars(select(RuntimeProfile).order_by(RuntimeProfile.created_at)).all()
        return {"profiles": [runtime_profile_dict(profile) for profile in profiles]}

    @app.post("/v1/runtime-profiles", status_code=201)
    def create_runtime_profile(body: RuntimeProfileCreate, session: Session = Depends(db)):
        if session.scalar(select(RuntimeProfile).where(RuntimeProfile.name == body.name)):
            raise HTTPException(409, "runtime profile name already exists")
        profile = RuntimeProfile(
            name=body.name, adapter=body.adapter, model_config=normalize_model_config(body.model.model_dump(exclude_none=True)),
            system_prompt=body.systemPrompt, thinking_level=body.thinkingLevel, enabled=body.enabled,
        )
        session.add(profile); session.flush()
        emit(session, "runtime_profile.created", profile.id, {"runtimeProfileId": profile.id})
        session.commit(); session.refresh(profile)
        return runtime_profile_dict(profile)

    def parse_size(raw: str | None) -> int:
        if not raw:
            return 0
        try:
            value, unit = raw.replace(",", "").split()[:2]
            return int(float(value) * {"B": 1, "KB": 1024, "MB": 1024 ** 2, "GB": 1024 ** 3}.get(unit.upper(), 1))
        except (ValueError, IndexError):
            return 0

    @app.post("/v1/bootstrap", status_code=201)
    def bootstrap(body: BootstrapRequest, session: Session = Depends(db)):
        if session.scalar(select(func.count(Team.id))):
            from fastapi.responses import JSONResponse
            return JSONResponse({"imported": False, "reason": "wework is not empty"}, status_code=200)
        for raw_team in body.teams:
            team = Team(id=raw_team.get("id") or str(uuid4()), name=raw_team.get("name") or "未命名团队",
                        description=raw_team.get("description", ""), topology=raw_team.get("topology", "roundTable"),
                        workspace_assignment=raw_team.get("workspaceAssignment"))
            session.add(team)
            employees: dict[str, Employee] = {}
            for raw_employee in raw_team.get("employees", []):
                active = raw_employee.get("activeSession") or {}
                employee = Employee(id=raw_employee.get("id") or str(uuid4()), team=team,
                               display_name=raw_employee.get("displayName") or "Employee",
                               role_name=raw_employee.get("roleName", "专职算法工程师"), color=raw_employee.get("color", "#0BA5EC"),
                               status=raw_employee.get("status", "idle"), runtime=raw_employee.get("runtime", "Workspace"),
                               is_lead=bool(raw_employee.get("isLead")), skills=raw_employee.get("builtInSkills", []),
                               session_id=active.get("id") or str(uuid4()), context_ratio=active.get("contextRatio", 0),
                               metrics=active.get("metrics", []), workspace_assignment=raw_employee.get("workspaceAssignment"))
                employees[employee.id] = employee
                session.add(employee)
                for raw_message in active.get("messages", []):
                    session.add(Message(id=raw_message.get("id") or str(uuid4()), employee=employee,
                                        sender=raw_message.get("sender", "system"), sender_name=raw_message.get("senderName"),
                                        text=raw_message.get("text", "")))
                for raw_artifact in raw_employee.get("artifacts", []):
                    artifact_id = raw_artifact.get("id") or str(uuid4())
                    session.add(Artifact(id=artifact_id, employee=employee, name=raw_artifact.get("name", "artifact"),
                                         type=raw_artifact.get("type", "data"), size_bytes=parse_size(raw_artifact.get("size")),
                                         storage_key=f"seed-metadata/{team.id}/{employee.id}/{artifact_id}",
                                         description=raw_artifact.get("description")))
                work_groups = [(raw_employee.get("currentWorkItem"), "running", 0)]
                work_groups += [(item, "pending", index + 1) for index, item in enumerate(raw_employee.get("queuedWorkItems", []))]
                work_groups += [(item, "completed", None) for item in raw_employee.get("completedWorkItems", [])]
                for raw_work, status, position in work_groups:
                    if not raw_work:
                        continue
                    session.add(Work(id=raw_work.get("id") or str(uuid4()), team=team, employee=employee,
                                     title=raw_work.get("title", "未命名任务"), goal=raw_work.get("goal", ""),
                                     constraints=raw_work.get("constraints"), status=status,
                                     priority=raw_work.get("priority", "medium"), category=raw_work.get("category", "Digital"),
                                     queue_position=position))
            for raw_work in raw_team.get("pendingWorks", []):
                session.add(Work(id=raw_work.get("id") or str(uuid4()), team=team,
                                 title=raw_work.get("title", "未命名任务"), goal=raw_work.get("goal", ""),
                                 constraints=raw_work.get("constraints"), status="pending",
                                 priority=raw_work.get("priority", "medium"), category=raw_work.get("category", "Digital")))
            raw_workflow = raw_team.get("workflow")
            if raw_workflow:
                session.add(Workflow(id=raw_workflow.get("id") or str(uuid4()), team=team,
                                     name=raw_workflow.get("name", "工作流"), description=raw_workflow.get("description", ""),
                                     nodes=raw_workflow.get("nodes", [])))
        session.flush(); emit(session, "wework.bootstrapped", "wework", {"teamCount": len(body.teams)}); session.commit()
        return {"imported": True, "teamCount": len(body.teams)}

    @app.post("/v1/teams", status_code=201)
    def create_team(body: TeamCreate, session: Session = Depends(db)):
        get_runtime_profile(session, body.defaultRuntimeProfileId)
        team = Team(name=body.name, description=body.description,
                    default_runtime_profile_id=body.defaultRuntimeProfileId)
        lead = Employee(team=team, display_name=body.leadName, role_name=body.leadRole, runtime=body.runtime,
                        default_runtime_profile_id=body.defaultRuntimeProfileId,
                        color="#C8102E", is_lead=True, skills=[{"id": "skill-core", "name": "团队协同调度与决策"}])
        session.add_all([team, lead])
        session.flush()
        emit(session, "team.created", team.id, {"teamId": team.id})
        session.commit()
        session.refresh(team)
        return team_dict(team)

    @app.post("/v1/teams/{team_id}/employees", status_code=201)
    def create_employee(team_id: str, body: EmployeeCreate, session: Session = Depends(db)):
        team = get_team(session, team_id)
        get_runtime_profile(session, body.defaultRuntimeProfileId)
        employee = Employee(team=team, display_name=body.displayName, role_name=body.roleName,
                       runtime=body.runtime, color=body.color,
                       default_runtime_profile_id=body.defaultRuntimeProfileId,
                       skills=[{"id": "skill-new", "name": "基础通用自动化技能"}])
        session.add(employee); session.flush()
        emit(session, "employee.created", employee.id, {"teamId": team_id, "employeeId": employee.id})
        session.commit()
        return employee_dict(employee)

    @app.put("/v1/teams/{team_id}/workspace")
    def update_team_workspace(team_id: str, body: TeamWorkspaceUpdate, session: Session = Depends(db)):
        team = get_team(session, team_id)
        team.workspace_assignment = body.workspaceAssignment.model_dump(exclude_none=True) if body.workspaceAssignment else None
        emit(session, "team.workspace.updated", team.id, {"teamId": team.id})
        session.commit()
        return team_dict(team)

    @app.post("/v1/teams/{team_id}/messages", status_code=201)
    def create_team_message(team_id: str, body: TeamMessageCreate, session: Session = Depends(db)):
        team = get_team(session, team_id)
        message = {"id": f"team-message-{uuid4()}", "sender": "user", "senderName": "你", "text": body.text, "time": iso(utcnow())}
        team.team_messages = [*(team.team_messages or []), message]
        session.add(team); emit(session, "team.message.created", team.id, {"teamId": team.id, "messageId": message["id"]}); session.commit()
        return message

    @app.delete("/v1/teams/{team_id}/employees/{employee_id}")
    def remove_employee(team_id: str, employee_id: str, session: Session = Depends(db)):
        employee = get_employee(session, employee_id)
        if employee.team_id != team_id:
            raise HTTPException(404, "employee not found in team")
        if employee.is_lead:
            raise HTTPException(409, "transfer team lead before removal")
        for work in employee.works:
            if work.status in {"running", "pending"}:
                work.status, work.assigned_employee_id, work.queue_position = "pending", None, None
        session.delete(employee); emit(session, "employee.removed", employee_id, {"teamId": team_id}); session.commit()
        return {"deleted": employee_id}

    @app.patch("/v1/employees/{employee_id}")
    def update_employee(employee_id: str, body: EmployeeUpdate, session: Session = Depends(db)):
        employee = get_employee(session, employee_id)
        updates = body.model_dump(exclude_unset=True)
        if "displayName" in updates:
            employee.display_name = updates["displayName"]
        if "roleName" in updates:
            employee.role_name = updates["roleName"]
        if "runtime" in updates:
            employee.runtime = updates["runtime"]
        if "skills" in updates:
            employee.skills = updates["skills"]
        if "defaultRuntimeProfileId" in updates:
            get_runtime_profile(session, updates["defaultRuntimeProfileId"])
            employee.default_runtime_profile_id = updates["defaultRuntimeProfileId"]
        if "workspaceAssignment" in updates:
            assignment = updates["workspaceAssignment"]
            employee.workspace_assignment = assignment or None
        emit(session, "employee.updated", employee.id, {"teamId": employee.team_id, "employeeId": employee.id})
        session.commit()
        return employee_dict(employee)

    @app.post("/v1/employees/{employee_id}/reset-context")
    def reset_employee_context(employee_id: str, session: Session = Depends(db)):
        employee = get_employee(session, employee_id)
        employee.messages.clear()
        session.execute(delete(RuntimeSession).where(RuntimeSession.employee_id == employee.id))
        employee.session_id = uid()
        employee.context_ratio = 0
        employee.metrics = []
        emit(session, "employee.context_reset", employee.id, {"teamId": employee.team_id, "employeeId": employee.id})
        session.commit()
        return employee_dict(employee)

    @app.post("/v1/teams/{team_id}/lead")
    def change_lead(team_id: str, body: LeadChange, session: Session = Depends(db)):
        team = get_team(session, team_id)
        if body.employeeId not in {employee.id for employee in team.employees}:
            raise HTTPException(404, "employee not found in team")
        for employee in team.employees:
            employee.is_lead = employee.id == body.employeeId
        emit(session, "team.lead_changed", team_id, {"employeeId": body.employeeId}); session.commit()
        return {"teamId": team_id, "employeeId": body.employeeId}

    @app.post("/v1/teams/{team_id}/works", status_code=201)
    def create_work(team_id: str, body: WorkCreate, session: Session = Depends(db)):
        get_team(session, team_id)
        get_runtime_profile(session, body.runtimeProfileId)
        work = Work(team_id=team_id, title=body.title, goal=body.goal, constraints=body.constraints,
                    priority=body.priority, category=body.category, runtime_profile_id=body.runtimeProfileId)
        session.add(work); session.flush(); emit(session, "work.created", work.id, {"teamId": team_id, "workId": work.id}); session.commit()
        return work_dict(work)

    @app.post("/v1/works/{work_id}/assign")
    def assign_work(work_id: str, body: AssignWork, session: Session = Depends(db)):
        work, employee = session.get(Work, work_id), get_employee(session, body.employeeId)
        if not work:
            raise HTTPException(404, "work not found")
        if work.team_id != employee.team_id or work.status not in {"pending", "blocked"}:
            raise HTTPException(409, "work cannot be assigned")
        current = session.scalar(select(Work).where(Work.assigned_employee_id == employee.id, Work.status == "running"))
        work.assigned_employee_id = employee.id
        if current:
            max_position = session.scalar(select(func.max(Work.queue_position)).where(Work.assigned_employee_id == employee.id)) or 0
            work.status, work.queue_position = "pending", max_position + 1
        else:
            work.status, work.queue_position, employee.status = "running", 0, "working"
        profile_id = work.runtime_profile_id or employee.default_runtime_profile_id or employee.team.default_runtime_profile_id
        profile = get_runtime_profile(session, profile_id)
        if employee.runtime == "Pi" and (not profile or profile.adapter != "pi" or not profile.enabled):
            raise HTTPException(409, "Pi employee requires an enabled Pi runtime profile")
        last_attempt = session.scalar(select(func.max(RuntimeRun.attempt)).where(RuntimeRun.work_id == work.id)) or 0
        run = RuntimeRun(work_id=work.id, employee_id=employee.id, runtime=employee.runtime,
                         runtime_profile_id=profile.id if profile else None, status="queued",
                         attempt=last_attempt + 1)
        session.add(run); session.flush()
        emit(session, "work.assigned", work.id, {"workId": work.id, "employeeId": employee.id, "runId": run.id}); session.commit()
        return work_dict(work)

    @app.patch("/v1/works/{work_id}")
    def update_work(work_id: str, body: WorkUpdate, session: Session = Depends(db)):
        work = session.get(Work, work_id)
        if not work:
            raise HTTPException(404, "work not found")
        for key, value in body.model_dump(exclude_unset=True).items():
            setattr(work, key, value)
        emit(session, "work.updated", work.id, {"teamId": work.team_id, "workId": work.id})
        session.commit()
        return work_dict(work)

    @app.post("/v1/works/{work_id}/cancel")
    def cancel_work(work_id: str, session: Session = Depends(db)):
        work = session.get(Work, work_id)
        if not work:
            raise HTTPException(404, "work not found")
        if work.status in {"completed", "cancelled"}:
            raise HTTPException(409, "work cannot be cancelled")
        employee = work.employee
        was_running = work.status == "running"
        work.status = "cancelled"
        work.queue_position = None
        session.execute(update(RuntimeRun).where(
            RuntimeRun.work_id == work.id,
            RuntimeRun.status.in_(["queued", "running"]),
        ).values(status="cancelled", error="cancelled by user"))
        if was_running and employee:
            promote_next(session, employee)
        emit(session, "work.cancelled", work.id, {"teamId": work.team_id, "workId": work.id,
                                                    "employeeId": work.assigned_employee_id})
        session.commit()
        return work_dict(work)

    def promote_next(session: Session, employee: Employee):
        next_work = session.scalar(select(Work).where(Work.assigned_employee_id == employee.id, Work.status == "pending").order_by(Work.queue_position, Work.created_at))
        if next_work:
            next_work.status, next_work.queue_position, employee.status = "running", 0, "working"
        else:
            employee.status = "idle"

    @app.post("/v1/employees/{employee_id}/complete-current")
    def complete_current(employee_id: str, session: Session = Depends(db)):
        employee = get_employee(session, employee_id)
        work = session.scalar(select(Work).where(Work.assigned_employee_id == employee.id, Work.status == "running"))
        if not work:
            raise HTTPException(409, "employee has no running work")
        work.status = "completed"
        session.execute(update(RuntimeRun).where(
            RuntimeRun.work_id == work.id,
            RuntimeRun.status.in_(["queued", "running"]),
        ).values(status="completed", error=None))
        promote_next(session, employee)
        emit(session, "work.completed", work.id, {"workId": work.id, "employeeId": employee.id}); session.commit()
        return work_dict(work)

    @app.post("/v1/employees/{employee_id}/return-current")
    def return_current(employee_id: str, session: Session = Depends(db)):
        employee = get_employee(session, employee_id)
        work = session.scalar(select(Work).where(Work.assigned_employee_id == employee.id, Work.status == "running"))
        if not work:
            raise HTTPException(409, "employee has no running work")
        work.status, work.assigned_employee_id, work.queue_position = "pending", None, None
        session.execute(update(RuntimeRun).where(
            RuntimeRun.work_id == work.id,
            RuntimeRun.status.in_(["queued", "running"]),
        ).values(status="cancelled", error="returned to pending by user"))
        promote_next(session, employee); emit(session, "work.returned", work.id, {"workId": work.id, "employeeId": employee.id}); session.commit()
        return work_dict(work)

    @app.post("/v1/employees/{employee_id}/messages", status_code=201)
    def create_message(employee_id: str, body: MessageCreate, session: Session = Depends(db)):
        employee = get_employee(session, employee_id)
        message = Message(employee=employee, sender=body.sender, sender_name=body.senderName, text=body.text)
        session.add(message); session.flush(); emit(session, "message.created", message.id, {"employeeId": employee_id, "messageId": message.id}); session.commit()
        return message_dict(message)

    @app.get("/v1/teams/{team_id}/workflow")
    def get_workflow(team_id: str, response: Response, session: Session = Depends(db)):
        team = get_team(session, team_id)
        if not team.workflow:
            raise HTTPException(404, "workflow not found")
        response.headers["ETag"] = f'"{team.workflow.version}"'
        return workflow_dict(team.workflow)

    def expected_workflow_version(if_match: str | None, body: WorkflowSave) -> int | None:
        if if_match:
            raw = if_match.strip()
            if raw.startswith('W/'):
                raw = raw[2:]
            raw = raw.strip('"')
            try:
                return int(raw)
            except ValueError:
                raise HTTPException(400, "If-Match must contain a numeric workflow version")
        return body.version

    @app.put("/v1/teams/{team_id}/workflow")
    def save_workflow(team_id: str, body: WorkflowSave, response: Response,
                      if_match: str | None = Header(None, alias="If-Match"), session: Session = Depends(db)):
        team = get_team(session, team_id); validate_workflow(body)
        nodes = [node.model_dump(exclude_none=True) for node in body.nodes]
        if team.workflow:
            if body.id != team.workflow.id:
                raise HTTPException(409, {"error": "workflow_id_mismatch", "workflowId": team.workflow.id})
            expected = expected_workflow_version(if_match, body)
            if expected is None:
                raise HTTPException(428, {"error": "workflow_version_required", "currentVersion": team.workflow.version})
            result = session.execute(
                update(Workflow).where(Workflow.id == team.workflow.id, Workflow.version == expected).values(
                    name=body.name, description=body.description, nodes=nodes,
                    version=Workflow.version + 1, updated_at=utcnow(),
                )
            )
            if result.rowcount != 1:
                session.rollback()
                current = session.get(Workflow, team.workflow.id)
                raise HTTPException(409, {"error": "workflow_version_conflict", "currentVersion": current.version})
            session.flush(); session.expire(team.workflow); workflow = team.workflow
        else:
            workflow = Workflow(id=body.id, team=team, name=body.name, description=body.description, nodes=nodes)
            session.add(workflow)
            session.flush()
        emit(session, "workflow.saved", workflow.id, {"teamId": team_id, "workflowId": workflow.id, "version": workflow.version}); session.commit()
        response.headers["ETag"] = f'"{workflow.version}"'
        return workflow_dict(workflow)

    @app.post("/v1/employees/{employee_id}/artifacts", status_code=201)
    def create_artifact(employee_id: str, file: UploadFile = File(...), artifact_type: str = Form("data"), description: str | None = Form(None), session: Session = Depends(db)):
        employee = get_employee(session, employee_id)
        artifact_id, suffix = str(uuid4()), Path(file.filename or "artifact").suffix
        key = f"{employee.team_id}/{employee.id}/{artifact_id}{suffix}"
        storage.put(key, file.file)
        size = file.file.seek(0, 2)
        artifact = Artifact(id=artifact_id, employee=employee, name=file.filename or "artifact", type=artifact_type,
                            content_type=file.content_type or "application/octet-stream", size_bytes=size,
                            storage_key=key, description=description)
        session.add(artifact); session.flush(); emit(session, "artifact.created", artifact.id, {"employeeId": employee_id, "artifactId": artifact.id}); session.commit()
        return artifact_dict(artifact)

    @app.get("/v1/events")
    def events(after: int = Query(0, ge=0), limit: int = Query(200, ge=1, le=1000), session: Session = Depends(db)):
        rows = session.scalars(select(Event).where(Event.id > after).order_by(Event.id).limit(limit)).all()
        return {"events": [{"id": row.id, "type": row.type, "aggregateId": row.aggregate_id,
                            "payload": row.payload, "createdAt": iso(row.created_at)} for row in rows],
                "cursor": rows[-1].id if rows else after}

    @app.get("/v1/events/stream")
    async def event_stream(after: int = Query(0, ge=0), last_event_id: str | None = Header(None, alias="Last-Event-ID")):
        async def generate():
            cursor = resolve_event_cursor(after, last_event_id)
            while True:
                with factory() as session:
                    rows = session.scalars(select(Event).where(Event.id > cursor).order_by(Event.id).limit(100)).all()
                    for row in rows:
                        cursor = row.id
                        payload = {"id": row.id, "type": row.type, "aggregateId": row.aggregate_id, "payload": row.payload}
                        yield f"id: {row.id}\nevent: wework\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"
                if not rows:
                    yield ": heartbeat\n\n"
                await asyncio.sleep(2)
        return StreamingResponse(generate(), media_type="text/event-stream")

    def run_dict(run: RuntimeRun) -> dict:
        return {"id": run.id, "workId": run.work_id, "employeeId": run.employee_id,
                "runtime": run.runtime, "status": run.status, "attempt": run.attempt,
                "runtimeProfileId": run.runtime_profile_id, "runtimeSessionId": run.runtime_session_id,
                "externalRunId": run.external_run_id, "error": run.error,
                "createdAt": iso(run.created_at), "updatedAt": iso(run.updated_at)}

    def claimed_run_dict(session: Session, run: RuntimeRun) -> dict:
        profile = session.get(RuntimeProfile, run.runtime_profile_id)
        work, employee = session.get(Work, run.work_id), session.get(Employee, run.employee_id)
        runtime_session = session.scalar(select(RuntimeSession).where(
            RuntimeSession.employee_id == run.employee_id,
            RuntimeSession.runtime_profile_id == run.runtime_profile_id,
        ))
        if not runtime_session:
            runtime_session = RuntimeSession(employee_id=run.employee_id, runtime_profile_id=run.runtime_profile_id)
            session.add(runtime_session); session.flush()
        run.runtime_session_id = runtime_session.id
        result = run_dict(run)
        result.update({
            "runtimeProfile": runtime_profile_dict(profile),
            "work": {"id": work.id, "title": work.title, "goal": work.goal,
                     "constraints": work.constraints, "priority": work.priority},
            "employee": {"id": employee.id, "displayName": employee.display_name,
                         "roleName": employee.role_name, "skills": employee.skills},
            "session": {"id": runtime_session.id, "nativeSessionId": runtime_session.native_session_id,
                        "messages": runtime_session.messages, "version": runtime_session.version},
        })
        return result

    @app.get("/v1/runtime-runs", dependencies=[Depends(internal_auth)])
    def list_runtime_runs(status: str | None = Query(None), adapter: str | None = Query(None),
                          limit: int = Query(100, ge=1, le=500), session: Session = Depends(db)):
        query = select(RuntimeRun).order_by(RuntimeRun.created_at).limit(limit)
        if status:
            query = query.where(RuntimeRun.status == status)
            if status == "queued":
                query = query.join(Work, RuntimeRun.work_id == Work.id).where(Work.status == "running")
        if adapter:
            query = query.join(RuntimeProfile, RuntimeRun.runtime_profile_id == RuntimeProfile.id).where(
                RuntimeProfile.adapter == adapter
            )
        return {"runs": [run_dict(run) for run in session.scalars(query).all()]}

    @app.post("/v1/runtime-runs/{run_id}/claim", dependencies=[Depends(internal_auth)])
    def claim_runtime_run(run_id: str, session: Session = Depends(db)):
        run = session.get(RuntimeRun, run_id)
        if not run:
            raise HTTPException(404, "runtime run not found")
        if run.status != "queued":
            raise HTTPException(409, "runtime run already claimed")
        run.status = "running"
        result = claimed_run_dict(session, run) if run.runtime_profile_id else run_dict(run)
        emit(session, "runtime.claimed", run.id, {"runId": run.id}); session.commit()
        return result

    @app.post("/v1/runtime-runs/{run_id}/complete", dependencies=[Depends(internal_auth)])
    def complete_runtime_run(run_id: str, body: RuntimeComplete, session: Session = Depends(db)):
        run = session.get(RuntimeRun, run_id)
        if not run:
            raise HTTPException(404, "runtime run not found")
        if run.status != "running" or not run.runtime_session_id:
            raise HTTPException(409, "runtime run is not active")
        runtime_session = session.get(RuntimeSession, run.runtime_session_id)
        runtime_session.native_session_id = body.nativeSessionId
        runtime_session.messages = body.messages
        runtime_session.usage = body.usage
        runtime_session.version += 1
        run.status, run.external_run_id, run.error = body.status, body.nativeSessionId, body.error
        work, employee = session.get(Work, run.work_id), session.get(Employee, run.employee_id)
        if body.finalText:
            session.add(Message(employee_id=employee.id, sender="employee", sender_name=employee.display_name,
                                text=body.finalText))
        if body.status == "succeeded" and work.status == "running":
            work.status = "completed"
            promote_next(session, employee)
        elif body.status == "failed" and work.status == "running":
            work.status = "blocked"
            employee.status = "blocked"
        emit(session, "runtime.completed", run.id, {
            "runId": run.id, "status": run.status, "runtimeSessionId": runtime_session.id,
        })
        session.commit()
        return run_dict(run)

    @app.patch("/v1/runtime-runs/{run_id}", dependencies=[Depends(internal_auth)])
    def runtime_callback(run_id: str, body: RuntimeUpdate, session: Session = Depends(db)):
        run = session.get(RuntimeRun, run_id)
        if not run:
            raise HTTPException(404, "runtime run not found")
        run.status, run.external_run_id, run.error = body.status, body.externalRunId, body.error
        emit(session, "runtime.updated", run.id, {"runId": run.id, "status": run.status}); session.commit()
        return run_dict(run)

    return app


app = create_app()
