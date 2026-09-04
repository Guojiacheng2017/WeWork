import re
from typing import Annotated, Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, TypeAdapter, ValidationError, ValidationInfo, field_validator, model_validator


Runtime = Literal["Pi", "Claude Code", "DSH", "Workspace"]
MODEL_API_KEY_ENV_NAMES = {"WEWORK_MODEL_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "AZURE_OPENAI_API_KEY", "DASHSCOPE_API_KEY", "QWEN_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "LOCAL_MODEL_API_KEY"}
_http_url_adapter = TypeAdapter(AnyHttpUrl)


def js_code_unit_length(value: str) -> int:
    return len(value.encode("utf-16-le", errors="surrogatepass")) // 2


def js_trim(value: str) -> str:
    return re.sub(r"^[\s\ufeff]+|[\s\ufeff]+$", "", value)


class LocalWorkspaceAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    kind: Literal["local"]
    rootPath: str | None = Field(default=None, min_length=1, max_length=4096)

    @field_validator("rootPath")
    @classmethod
    def absolute_root(cls, value: str | None):
        if value is None:
            return value
        value = js_trim(value)
        if js_code_unit_length(value) > 4096 or not (value.startswith("/") or value.startswith("\\\\") or re.match(r"^[A-Za-z]:[\\/]", value)):
            raise ValueError("local rootPath must be absolute")
        return value


class SshWorkspaceAssignment(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    kind: Literal["ssh"]
    host: str = Field(min_length=1, max_length=253)
    port: int = Field(ge=1, le=65535)
    username: str = Field(min_length=1, max_length=255)
    rootPath: str = Field(min_length=1, max_length=4096)
    credentialRef: str = Field(min_length=1, max_length=500)

    @field_validator("host")
    @classmethod
    def valid_host(cls, value: str):
        value = value.strip()
        if not re.fullmatch(r"(?=.{1,253}$)(?:\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*)", value):
            raise ValueError("invalid SSH host")
        return value

    @field_validator("username")
    @classmethod
    def valid_username(cls, value: str):
        value = value.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9._-]{0,63}", value):
            raise ValueError("invalid SSH username")
        return value

    @field_validator("rootPath")
    @classmethod
    def valid_root(cls, value: str):
        value = js_trim(value)
        if js_code_unit_length(value) > 4096 or not value.startswith("/") or re.search(r"[\x00-\x1f\x7f]", value):
            raise ValueError("invalid SSH rootPath")
        return value

    @field_validator("credentialRef")
    @classmethod
    def valid_credential_ref(cls, value: str):
        value = value.strip()
        if not re.fullmatch(r"[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9][A-Za-z0-9._-]{0,63}(?:/[A-Za-z0-9][A-Za-z0-9._-]{0,63}){0,7}", value):
            raise ValueError("invalid credential reference")
        return value


WorkspaceAssignment = Annotated[LocalWorkspaceAssignment | SshWorkspaceAssignment, Field(discriminator="kind")]
_workspace_assignment_adapter = TypeAdapter(WorkspaceAssignment)


def normalize_workspace_assignment(value):
    if value is None:
        return None
    return _workspace_assignment_adapter.validate_python(value).model_dump(exclude_none=True)


class TeamWorkspaceUpdate(BaseModel):
    workspaceAssignment: WorkspaceAssignment | None = None


class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    leadName: str = "Employee-01 (负责人)"
    leadRole: str = "团队负责人"
    runtime: Runtime = "Pi"
    defaultRuntimeProfileId: str | None = None
    workspaceAssignment: WorkspaceAssignment | None = None
    initializeLead: bool = True


class TeamMessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=10000)


class EmployeeCreate(BaseModel):
    displayName: str = Field(default="新助手", min_length=1, max_length=200)
    roleName: str = "专职算法工程师"
    runtime: Runtime = "Workspace"
    color: str = "#0BA5EC"
    defaultRuntimeProfileId: str | None = None


class SkillInput(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)


class EmployeeUpdate(BaseModel):
    displayName: str | None = Field(default=None, min_length=1, max_length=200)
    roleName: str | None = Field(default=None, min_length=1, max_length=200)
    runtime: Runtime | None = None
    skills: list[SkillInput] | None = None
    defaultRuntimeProfileId: str | None = None
    workspaceAssignment: WorkspaceAssignment | None = None


class WorkCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    goal: str = ""
    constraints: str | None = None
    priority: Literal["low", "medium", "high"] = "medium"
    category: Literal["Paperwork", "Digital"] = "Digital"
    runtimeProfileId: str | None = None


class WorkUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    goal: str | None = None
    priority: Literal["low", "medium", "high"] | None = None
    category: Literal["Paperwork", "Digital"] | None = None


class PiModelConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    provider: str = Field(min_length=1, max_length=100)
    modelId: str = Field(min_length=1, max_length=300)
    api: Literal["openai-completions", "openai-responses"] | None = None
    baseUrl: str | None = Field(default=None, max_length=4096)
    credentialRef: str | None = Field(default=None, min_length=1, max_length=500)
    apiKeyEnv: str | None = Field(default=None, min_length=1, max_length=200)
    contextWindow: int | None = Field(default=None, ge=1024, le=9007199254740991)
    maxTokens: int | None = Field(default=None, ge=1, le=9007199254740991)

    @field_validator("provider", "modelId")
    @classmethod
    def valid_model_text(cls, value: str, info: ValidationInfo):
        value = js_trim(value)
        limit = 100 if info.field_name == "provider" else 300
        if not value or js_code_unit_length(value) > limit or re.search(r"[\x00-\x1f\x7f]", value):
            raise ValueError("invalid model field")
        return value

    @field_validator("credentialRef")
    @classmethod
    def valid_model_credential_ref(cls, value: str | None):
        if value is None:
            return value
        value = value.strip()
        if not re.fullmatch(r"[a-z][a-z0-9_-]{0,31}:[A-Za-z0-9][A-Za-z0-9._-]{0,63}(?:/[A-Za-z0-9][A-Za-z0-9._-]{0,63}){0,7}", value):
            raise ValueError("invalid credential reference")
        return value

    @field_validator("apiKeyEnv")
    @classmethod
    def valid_api_key_env(cls, value: str | None):
        if value is None:
            return value
        if not re.fullmatch(r"[A-Z_][A-Z0-9_]{0,127}", value) or value not in MODEL_API_KEY_ENV_NAMES:
            raise ValueError("invalid API key environment name")
        return value

    @field_validator("baseUrl")
    @classmethod
    def valid_model_url(cls, value: str | None):
        if value is None:
            return value
        value = js_trim(value)
        if not value or js_code_unit_length(value) > 4096 or re.search(r"[\x00-\x20\x7f]", value):
            raise ValueError("invalid model URL")
        try:
            parsed = _http_url_adapter.validate_python(value)
        except ValidationError as error:
            raise ValueError("invalid model URL") from error
        if parsed.username is not None or parsed.password is not None:
            raise ValueError("invalid model URL")
        return value

    @model_validator(mode="after")
    def one_model_credential_source(self):
        if self.credentialRef and self.apiKeyEnv:
            raise ValueError("credentialRef and apiKeyEnv are mutually exclusive")
        return self


class RuntimeProfileCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    name: str = Field(min_length=1, max_length=200)
    adapter: Literal["pi", "smalldash"]
    model: PiModelConfig
    systemPrompt: str = ""
    thinkingLevel: Literal["off", "minimal", "low", "medium", "high", "xhigh"] = "off"
    enabled: bool = True

    @field_validator("name")
    @classmethod
    def valid_profile_name(cls, value: str):
        value = js_trim(value)
        if not value or js_code_unit_length(value) > 200 or re.search(r"[\x00-\x1f\x7f]", value):
            raise ValueError("invalid runtime profile name")
        return value

    @field_validator("systemPrompt")
    @classmethod
    def valid_system_prompt(cls, value: str):
        if js_code_unit_length(value) > 100000 or re.search(r"[\x00\x7f]", value):
            raise ValueError("invalid system prompt")
        return value


class SessionExecutionImport(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: str = Field(min_length=1, max_length=200)
    name: str = Field(min_length=1, max_length=200)
    adapter: Literal["pi", "claude-code", "codex-cli", "gemini-cli", "smalldash"]
    model: PiModelConfig
    systemPrompt: str = ""
    thinkingLevel: Literal["off", "minimal", "low", "medium", "high", "xhigh"] = "off"
    enabled: bool = True
    sourceProfileId: str | None = Field(default=None, max_length=200)
    modelCatalogId: str | None = Field(default=None, max_length=200)
    profileRevision: int = Field(default=1, ge=1, le=9007199254740991)

    @field_validator("id", "name")
    @classmethod
    def valid_session_text(cls, value: str):
        value = js_trim(value)
        if not value or js_code_unit_length(value) > 200 or re.search(r"[\x00-\x1f\x7f]", value):
            raise ValueError("invalid Session identity or name")
        return value

    @field_validator("systemPrompt")
    @classmethod
    def valid_session_system_prompt(cls, value: str):
        if js_code_unit_length(value) > 100000 or re.search(r"[\x00\x7f]", value):
            raise ValueError("invalid system prompt")
        return value

    @field_validator("sourceProfileId", "modelCatalogId")
    @classmethod
    def valid_provenance_id(cls, value: str | None):
        if value is None:
            return value
        value = js_trim(value)
        if not value or js_code_unit_length(value) > 200 or re.search(r"[\x00-\x1f\x7f]", value):
            raise ValueError("invalid Session provenance id")
        return value


def normalize_model_config(value):
    return PiModelConfig.model_validate(value).model_dump(exclude_none=True)


class AssignWork(BaseModel):
    employeeId: str


class MessageCreate(BaseModel):
    text: str = Field(min_length=1)
    sender: Literal["user", "employee", "system"] = "user"
    senderName: str | None = None


class NodePosition(BaseModel):
    x: float = Field(allow_inf_nan=False)
    y: float = Field(allow_inf_nan=False)


class WorkflowNode(BaseModel):
    id: str
    roleName: str
    label: str
    stepNumber: int
    status: Literal["ready", "running", "completed", "blocked", "waiting"]
    assignedEmployeeId: str | None = None
    requires: list[str] = Field(default_factory=list)
    position: NodePosition | None = None


class WorkflowSave(BaseModel):
    id: str
    name: str
    description: str = ""
    nodes: list[WorkflowNode]
    version: int | None = Field(default=None, ge=1)


class LeadChange(BaseModel):
    employeeId: str


class RuntimeUpdate(BaseModel):
    status: Literal["queued", "running", "succeeded", "failed", "cancelled"]
    externalRunId: str | None = None
    error: str | None = None


class RuntimeComplete(BaseModel):
    status: Literal["succeeded", "failed", "cancelled"]
    nativeSessionId: str | None = None
    messages: list[dict] = Field(default_factory=list)
    finalText: str | None = None
    usage: dict = Field(default_factory=dict)
    error: str | None = None


class BootstrapRequest(BaseModel):
    teams: list[dict]

    @field_validator("teams")
    @classmethod
    def validate_imported_teams(cls, teams: list[dict]):
        safe_id = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$")
        normalized = []
        team_ids, employee_ids = set(), set()
        for raw in teams:
            team = dict(raw)
            team_id = team.get("id")
            if team_id is not None and (not isinstance(team_id, str) or not safe_id.fullmatch(team_id) or team_id in team_ids):
                raise ValueError("invalid immutable team id")
            if team_id is not None:
                team_ids.add(team_id)
            if "workspaceAssignment" in team:
                team["workspaceAssignment"] = normalize_workspace_assignment(team["workspaceAssignment"])
            employees = team.get("employees", [])
            if not isinstance(employees, list):
                raise ValueError("invalid employees")
            normalized_employees = []
            for raw_employee in employees:
                employee = dict(raw_employee)
                employee_id = employee.get("id")
                if employee_id is not None and (not isinstance(employee_id, str) or not safe_id.fullmatch(employee_id) or employee_id in employee_ids):
                    raise ValueError("invalid immutable employee id")
                if employee_id is not None:
                    employee_ids.add(employee_id)
                if "workspaceAssignment" in employee:
                    employee["workspaceAssignment"] = normalize_workspace_assignment(employee["workspaceAssignment"])
                active = employee.get("activeSession")
                if active is not None:
                    if not isinstance(active, dict):
                        raise ValueError("invalid active session")
                    if "execution" in active and active["execution"] is not None:
                        active = dict(active)
                        active["execution"] = SessionExecutionImport.model_validate(active["execution"]).model_dump(exclude_none=True)
                        employee["activeSession"] = active
                normalized_employees.append(employee)
            team["employees"] = normalized_employees
            normalized.append(team)
        return normalized
