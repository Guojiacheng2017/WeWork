import json
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import create_app, resolve_event_cursor


def make_client(tmp_path: Path) -> TestClient:
    app = create_app(
        database_url=f"sqlite:///{tmp_path / 'wework.db'}",
        artifact_root=tmp_path / "artifacts",
    )
    return TestClient(app)


def test_team_employee_and_snapshot_are_persisted(tmp_path: Path):
    with make_client(tmp_path) as client:
        team = client.post("/v1/teams", json={
            "name": "CV Team", "description": "模型研发",
            "leadName": "Employee-01", "leadRole": "负责人", "runtime": "Claude Code",
        })
        assert team.status_code == 201
        team_id = team.json()["id"]

        employee = client.post(f"/v1/teams/{team_id}/employees", json={
            "displayName": "Employee-02", "roleName": "训练工程师", "runtime": "Workspace",
        })
        assert employee.status_code == 201

        snapshot = client.get("/v1/wework").json()
        assert snapshot["teams"][0]["id"] == team_id
        assert len(snapshot["teams"][0]["employees"]) == 2


def test_team_workspace_assignment_round_trips_independently_and_validates_input(tmp_path: Path):
    with make_client(tmp_path) as client:
        team = client.post("/v1/teams", json={"name": "CV", "leadName": "Lead"}).json()
        assignment = {
            "kind": "ssh", "host": "gpu.example.com", "port": 22,
            "username": "alice", "rootPath": "/srv/cv", "credentialRef": "vault:ssh/team",
        }

        saved = client.put(f"/v1/teams/{team['id']}/workspace", json={"workspaceAssignment": assignment})
        assert saved.status_code == 200
        assert saved.json()["workspaceAssignment"] == assignment
        assert client.get("/v1/wework").json()["teams"][0]["workspaceAssignment"] == assignment

        employee_id = team["employees"][0]["id"]
        employee_assignment = {"kind": "local", "rootPath": "/Users/alice/private"}
        employee = client.patch(f"/v1/employees/{employee_id}", json={"workspaceAssignment": employee_assignment})
        assert employee.status_code == 200
        assert employee.json()["workspaceAssignment"] == employee_assignment
        snapshot = client.get("/v1/wework").json()["teams"][0]
        assert snapshot["workspaceAssignment"] == assignment
        assert snapshot["employees"][0]["workspaceAssignment"] == employee_assignment
        inherited = client.patch(f"/v1/employees/{employee_id}", json={"workspaceAssignment": None})
        assert inherited.status_code == 200
        assert "workspaceAssignment" not in inherited.json()
        assert client.get("/v1/wework").json()["teams"][0]["workspaceAssignment"] == assignment

        invalid = client.put(f"/v1/teams/{team['id']}/workspace", json={
            "workspaceAssignment": {**assignment, "port": 70000},
        })
        assert invalid.status_code == 422
        blank_local = client.put(f"/v1/teams/{team['id']}/workspace", json={
            "workspaceAssignment": {"kind": "local", "rootPath": "   "},
        })
        assert blank_local.status_code == 422
        blank_host = client.put(f"/v1/teams/{team['id']}/workspace", json={
            "workspaceAssignment": {**assignment, "host": "   "},
        })
        assert blank_host.status_code == 422
        assert client.get("/v1/wework").json()["teams"][0]["workspaceAssignment"] == assignment

        cleared = client.put(f"/v1/teams/{team['id']}/workspace", json={"workspaceAssignment": None})
        assert cleared.status_code == 200
        assert "workspaceAssignment" not in cleared.json()


def test_snapshot_fails_closed_on_corrupt_persisted_workspace_metadata_and_ids(tmp_path: Path):
    database = tmp_path / "wework.db"
    with make_client(tmp_path) as client:
        team = client.post("/v1/teams", json={"name": "CV", "leadName": "Lead"}).json()
    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE wework_teams SET workspace_assignment = ? WHERE id = ?", (
            json.dumps({"kind": "ssh", "host": "gpu.example.com", "port": 22, "username": "alice", "rootPath": "/srv/cv", "credentialRef": "vault:ssh-team", "privateKey": "secret"}),
            team["id"],
        ))
    app = create_app(database_url=f"sqlite:///{database}", artifact_root=tmp_path / "artifacts")
    with TestClient(app, raise_server_exceptions=False) as client:
        assert client.get("/v1/wework").status_code == 500

    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE wework_teams SET workspace_assignment = NULL, id = '../escape' WHERE id = ?", (team["id"],))
    with TestClient(app, raise_server_exceptions=False) as client:
        assert client.get("/v1/wework").status_code == 500


def test_snapshot_reads_previously_accepted_hierarchical_credential_reference(tmp_path: Path):
    database = tmp_path / "wework.db"
    with make_client(tmp_path) as client:
        team = client.post("/v1/teams", json={"name": "CV", "leadName": "Lead"}).json()
    assignment = {"kind": "ssh", "host": "gpu.example.com", "port": 22, "username": "alice", "rootPath": "/srv/cv", "credentialRef": "keychain:ssh/gpu"}
    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE wework_teams SET workspace_assignment = ? WHERE id = ?", (json.dumps(assignment), team["id"]))
    with make_client(tmp_path) as client:
        response = client.get("/v1/wework")
        assert response.status_code == 200
        assert response.json()["teams"][0]["workspaceAssignment"] == assignment


def test_runtime_profiles_reject_raw_model_secrets_and_fail_closed_when_persisted(tmp_path: Path):
    database = tmp_path / "wework.db"
    with make_client(tmp_path) as client:
        unsafe = client.post("/v1/runtime-profiles", json={
            "name": "Unsafe", "adapter": "pi", "model": {"provider": "openai", "modelId": "gpt", "apiKey": "sk-live-secret"},
        })
        assert unsafe.status_code == 422
        profile = client.post("/v1/runtime-profiles", json={
            "name": "Safe", "adapter": "pi", "model": {"provider": "openai", "modelId": "gpt", "credentialRef": "keychain:model/gpt"},
        })
        assert profile.status_code == 201
    with sqlite3.connect(database) as connection:
        connection.execute("UPDATE wework_runtime_profiles SET model_config = ? WHERE id = ?", (json.dumps({"provider": "openai", "modelId": "gpt", "apiKey": "sk-live-secret"}), profile.json()["id"]))
    with TestClient(create_app(database_url=f"sqlite:///{database}", artifact_root=tmp_path / "artifacts"), raise_server_exceptions=False) as client:
        response = client.get("/v1/runtime-profiles")
        assert response.status_code == 500
        assert "sk-live-secret" not in response.text


def test_bootstrap_rejects_raw_model_secrets_in_imported_session_execution(tmp_path: Path):
    with make_client(tmp_path) as client:
        response = client.post("/v1/bootstrap", json={"teams": [{
            "id": "team-safe", "name": "Safe", "employees": [{"id": "employee-safe", "activeSession": {"id": "session-safe", "execution": {
                "id": "execution-safe", "name": "Unsafe", "adapter": "pi", "model": {"provider": "openai", "modelId": "gpt", "token": "raw-token"}, "profileRevision": 1,
            }}}], "pendingWorks": [],
        }]})
        assert response.status_code == 422
        assert client.get("/v1/wework").json()["teams"] == []


def test_work_assignment_completion_and_return_are_transactional(tmp_path: Path):
    with make_client(tmp_path) as client:
        team = client.post("/v1/teams", json={"name": "CV", "leadName": "Lead", "runtime": "Claude Code"}).json()
        employee = client.post(f"/v1/teams/{team['id']}/employees", json={"displayName": "Worker"}).json()
        first = client.post(f"/v1/teams/{team['id']}/works", json={
            "title": "First", "goal": "run", "priority": "high", "category": "Digital",
        }).json()
        second = client.post(f"/v1/teams/{team['id']}/works", json={
            "title": "Second", "goal": "run", "priority": "medium", "category": "Paperwork",
        }).json()

        assert client.post(f"/v1/works/{first['id']}/assign", json={"employeeId": employee["id"]}).json()["status"] == "running"
        assert client.post(f"/v1/works/{second['id']}/assign", json={"employeeId": employee["id"]}).json()["status"] == "pending"
        assert client.post(f"/v1/employees/{employee['id']}/complete-current").status_code == 200

        snapshot = client.get("/v1/wework").json()
        worker = next(item for item in snapshot["teams"][0]["employees"] if item["id"] == employee["id"])
        assert worker["currentWorkItem"]["id"] == second["id"]
        assert worker["completedWorkItems"][0]["id"] == first["id"]

        assert client.post(f"/v1/employees/{employee['id']}/return-current").status_code == 200
        snapshot = client.get("/v1/wework").json()
        assert any(item["id"] == second["id"] for item in snapshot["teams"][0]["pendingWorks"])

        reassigned = client.post(f"/v1/works/{second['id']}/assign", json={"employeeId": employee["id"]})
        assert reassigned.status_code == 200
        assert reassigned.json()["status"] == "running"


def test_messages_workflow_artifacts_and_events_have_server_ownership(tmp_path: Path):
    with make_client(tmp_path) as client:
        team = client.post("/v1/teams", json={"name": "CV", "leadName": "Lead"}).json()
        employee_id = team["employees"][0]["id"]

        message = client.post(f"/v1/employees/{employee_id}/messages", json={"text": "开始执行"})
        assert message.status_code == 201

        workflow = {"id": "wf-1", "name": "Pipeline", "description": "", "nodes": [
            {"id": "n1", "roleName": "清洗", "label": "清洗", "stepNumber": 1, "status": "ready", "requires": []},
            {"id": "n2", "roleName": "训练", "label": "训练", "stepNumber": 2, "status": "waiting", "requires": ["n1"]},
        ]}
        assert client.put(f"/v1/teams/{team['id']}/workflow", json=workflow).status_code == 200

        artifact = client.post(f"/v1/employees/{employee_id}/artifacts", files={
            "file": ("report.md", b"# report", "text/markdown"),
        })
        assert artifact.status_code == 201
        assert (tmp_path / "artifacts" / artifact.json()["storageKey"]).is_file()

        events = client.get("/v1/events?after=0").json()["events"]
        event_types = {event["type"] for event in events}
        assert {"message.created", "workflow.saved", "artifact.created"} <= event_types


def test_cannot_remove_lead_or_create_cyclic_workflow(tmp_path: Path):
    with make_client(tmp_path) as client:
        team = client.post("/v1/teams", json={"name": "CV", "leadName": "Lead"}).json()
        lead_id = team["employees"][0]["id"]
        assert client.delete(f"/v1/teams/{team['id']}/employees/{lead_id}").status_code == 409

        cyclic = {"id": "wf", "name": "bad", "description": "", "nodes": [
            {"id": "a", "roleName": "A", "label": "A", "stepNumber": 1, "status": "ready", "requires": ["b"]},
            {"id": "b", "roleName": "B", "label": "B", "stepNumber": 2, "status": "waiting", "requires": ["a"]},
        ]}
        assert client.put(f"/v1/teams/{team['id']}/workflow", json=cyclic).status_code == 422


def test_runtime_adapter_can_claim_and_report_an_assigned_run(tmp_path: Path):
    with make_client(tmp_path) as client:
        team = client.post("/v1/teams", json={"name": "CV", "leadName": "Lead"}).json()
        employee = client.post(f"/v1/teams/{team['id']}/employees", json={"displayName": "Worker", "runtime": "Workspace"}).json()
        work = client.post(f"/v1/teams/{team['id']}/works", json={"title": "Train", "goal": "run"}).json()
        client.post(f"/v1/works/{work['id']}/assign", json={"employeeId": employee["id"]})

        queued = client.get("/v1/runtime-runs?status=queued").json()["runs"]
        assert len(queued) == 1
        run_id = queued[0]["id"]
        claimed = client.post(f"/v1/runtime-runs/{run_id}/claim").json()
        assert claimed["status"] == "running"
        assert client.post(f"/v1/runtime-runs/{run_id}/claim").status_code == 409
        reported = client.patch(f"/v1/runtime-runs/{run_id}", json={
            "status": "succeeded", "externalRunId": "workspace-task-1",
        }).json()
        assert reported["status"] == "succeeded"


def test_bootstrap_imports_demo_snapshot_once(tmp_path: Path):
    demo = [{
        "id": "cv-team", "name": "CV Team", "description": "demo", "topology": "roundTable",
        "employees": [{
            "id": "cv-01", "displayName": "Lead", "roleName": "负责人", "color": "#C8102E",
            "status": "working", "runtime": "Claude Code", "isLead": True,
            "builtInSkills": [{"id": "dispatch", "name": "调度"}],
            "activeSession": {"id": "sess-1", "contextRatio": 35, "updatedAt": "now",
                              "messages": [{"id": "m1", "sender": "system", "text": "ready", "time": "09:00"}],
                              "metrics": [{"label": "响应率", "value": 99, "maximum": 100, "unit": "%"}]},
            "artifacts": [{"id": "a1", "name": "report.md", "type": "report", "size": "12 KB", "createdAt": "09:10"}],
            "currentWorkItem": {"id": "w1", "title": "训练", "goal": "run", "status": "running", "priority": "high", "category": "Digital", "createdAt": "09:00"},
        }],
        "pendingWorks": [{"id": "w2", "title": "评估", "goal": "check", "status": "pending", "priority": "medium", "category": "Paperwork", "createdAt": "09:30"}],
        "workflow": {"id": "wf1", "name": "Pipeline", "description": "demo", "nodes": []},
    }]
    with make_client(tmp_path) as client:
        first = client.post("/v1/bootstrap", json={"teams": demo})
        assert first.status_code == 201
        assert first.json()["imported"] is True
        second = client.post("/v1/bootstrap", json={"teams": [{**demo[0], "name": "overwrite"}]})
        assert second.status_code == 200
        assert second.json()["imported"] is False
        snapshot = client.get("/v1/wework").json()
        assert snapshot["teams"][0]["name"] == "CV Team"
        assert snapshot["teams"][0]["employees"][0]["currentWorkItem"]["id"] == "w1"
        assert snapshot["teams"][0]["employees"][0]["activeSession"]["messages"][0]["text"] == "ready"


def test_bootstrap_rejects_unsafe_ids_and_secret_workspace_fields_transactionally(tmp_path: Path):
    invalid = [{
        "id": "../escape", "name": "Unsafe", "employees": [{
            "id": "employee-safe", "displayName": "Worker",
            "workspaceAssignment": {
                "kind": "ssh", "host": "gpu.example.com", "port": 22, "username": "alice",
                "rootPath": "/srv/team", "credentialRef": "vault:ssh-team", "privateKey": "RAW-SECRET",
            },
        }], "pendingWorks": [],
    }]
    with make_client(tmp_path) as client:
        response = client.post("/v1/bootstrap", json={"teams": invalid})
        assert response.status_code == 422
        assert client.get("/v1/wework").json()["teams"] == []


def test_workflow_persists_positions_and_rejects_stale_writes(tmp_path: Path):
    with make_client(tmp_path) as client:
        team = client.post("/v1/teams", json={"name": "CV", "leadName": "Lead"}).json()
        workflow = {"id": "wf-positioned", "name": "Pipeline", "description": "", "nodes": [
            {"id": "source", "roleName": "清洗", "label": "清洗", "stepNumber": 1, "status": "ready", "requires": [], "position": {"x": 120.5, "y": 80}},
            {"id": "target", "roleName": "训练", "label": "训练", "stepNumber": 2, "status": "waiting", "requires": ["source"], "position": {"x": 460, "y": 80}},
        ]}
        created = client.put(f"/v1/teams/{team['id']}/workflow", json=workflow)
        assert created.status_code == 200
        assert created.json()["version"] == 1
        assert created.json()["nodes"][1]["requires"] == ["source"]

        loaded = client.get(f"/v1/teams/{team['id']}/workflow")
        assert loaded.headers["etag"] == '"1"'
        assert loaded.json()["nodes"][1]["position"] == {"x": 460.0, "y": 80.0}

        updated_body = loaded.json()
        updated_body["nodes"][1]["position"] = {"x": 520, "y": 140}
        updated = client.put(
            f"/v1/teams/{team['id']}/workflow", json=updated_body, headers={"If-Match": '"1"'},
        )
        assert updated.status_code == 200
        assert updated.headers["etag"] == '"2"'

        stale = client.put(
            f"/v1/teams/{team['id']}/workflow", json=updated_body, headers={"If-Match": '"1"'},
        )
        assert stale.status_code == 409
        assert stale.json()["detail"]["currentVersion"] == 2
        no_precondition = {key: value for key, value in updated_body.items() if key != "version"}
        assert client.put(f"/v1/teams/{team['id']}/workflow", json=no_precondition).status_code == 428

        event = next(event for event in reversed(client.get("/v1/events?after=0").json()["events"]) if event["type"] == "workflow.saved")
        assert event["payload"]["workflowId"] == "wf-positioned"
        assert event["payload"]["version"] == 2


def test_sse_reconnect_uses_last_delivered_event_cursor():
    assert resolve_event_cursor(8, "12") == 12
    assert resolve_event_cursor(8, "not-a-number") == 8
    assert resolve_event_cursor(8, None) == 8


def test_employee_configuration_and_context_reset_are_persisted(tmp_path: Path):
    with make_client(tmp_path) as client:
        team = client.post("/v1/teams", json={"name": "CV", "leadName": "Lead"}).json()
        employee_id = team["employees"][0]["id"]
        client.post(f"/v1/employees/{employee_id}/messages", json={"text": "large context"})

        updated = client.patch(f"/v1/employees/{employee_id}", json={
            "displayName": "Orchestrator", "roleName": "任务调度官", "runtime": "DSH",
            "skills": [{"id": "dispatch", "name": "任务调度"}, {"id": "review", "name": "结果审查"}],
        })
        assert updated.status_code == 200
        assert updated.json()["roleName"] == "任务调度官"
        assert updated.json()["runtime"] == "DSH"
        assert [item["name"] for item in updated.json()["builtInSkills"]] == ["任务调度", "结果审查"]

        reset = client.post(f"/v1/employees/{employee_id}/reset-context")
        assert reset.status_code == 200
        assert reset.json()["activeSession"]["contextRatio"] == 0
        assert reset.json()["activeSession"]["messages"] == []
        assert reset.json()["activeSession"]["id"] != team["employees"][0]["activeSession"]["id"]


def test_cancelling_work_removes_it_and_promotes_next(tmp_path: Path):
    with make_client(tmp_path) as client:
        team = client.post("/v1/teams", json={"name": "CV", "leadName": "Lead", "runtime": "Claude Code"}).json()
        employee_id = team["employees"][0]["id"]
        first = client.post(f"/v1/teams/{team['id']}/works", json={"title": "First", "goal": "run"}).json()
        second = client.post(f"/v1/teams/{team['id']}/works", json={"title": "Second", "goal": "run"}).json()
        client.post(f"/v1/works/{first['id']}/assign", json={"employeeId": employee_id})
        client.post(f"/v1/works/{second['id']}/assign", json={"employeeId": employee_id})

        cancelled = client.post(f"/v1/works/{first['id']}/cancel")
        assert cancelled.status_code == 200
        assert cancelled.json()["status"] == "cancelled"
        snapshot = client.get("/v1/wework").json()
        employee = snapshot["teams"][0]["employees"][0]
        assert employee["currentWorkItem"]["id"] == second["id"]
        assert all(work["id"] != first["id"] for work in snapshot["teams"][0]["pendingWorks"])
        assert client.post(f"/v1/works/{first['id']}/cancel").status_code == 409


def test_pi_runtime_profile_employee_default_and_work_override(tmp_path: Path):
    with make_client(tmp_path) as client:
        default_profile = client.post("/v1/runtime-profiles", json={
            "name": "Pi default",
            "adapter": "pi",
            "model": {
                "provider": "anthropic",
                "modelId": "claude-sonnet-4-20250514",
                "apiKeyEnv": "ANTHROPIC_API_KEY",
            },
            "systemPrompt": "You are an wework employee.",
        })
        assert default_profile.status_code == 201
        override_profile = client.post("/v1/runtime-profiles", json={
            "name": "Local Qwen",
            "adapter": "pi",
            "model": {
                "provider": "local-vllm",
                "modelId": "Qwen/Qwen3-Coder-30B-A3B-Instruct",
                "api": "openai-completions",
                "baseUrl": "http://model-gateway:8000/v1",
                "apiKeyEnv": "LOCAL_MODEL_API_KEY",
                "contextWindow": 131072,
                "maxTokens": 8192,
            },
        })
        assert override_profile.status_code == 201

        team = client.post("/v1/teams", json={"name": "CV", "leadName": "Lead"}).json()
        employee = client.post(f"/v1/teams/{team['id']}/employees", json={
            "displayName": "Pi Worker",
            "runtime": "Pi",
            "defaultRuntimeProfileId": default_profile.json()["id"],
        })
        assert employee.status_code == 201
        assert employee.json()["defaultRuntimeProfileId"] == default_profile.json()["id"]

        work = client.post(f"/v1/teams/{team['id']}/works", json={
            "title": "Train", "goal": "produce a plan",
            "runtimeProfileId": override_profile.json()["id"],
        })
        assert work.status_code == 201
        assert work.json()["runtimeProfileId"] == override_profile.json()["id"]

        client.post(f"/v1/works/{work.json()['id']}/assign", json={"employeeId": employee.json()["id"]})
        run = client.get("/v1/runtime-runs?status=queued&adapter=pi").json()["runs"][0]
        assert run["runtimeProfileId"] == override_profile.json()["id"]


def test_pi_claim_returns_portable_session_and_completion_checkpoints_it(tmp_path: Path):
    with make_client(tmp_path) as client:
        profile = client.post("/v1/runtime-profiles", json={
            "name": "Pi local",
            "adapter": "pi",
            "model": {
                "provider": "local-vllm", "modelId": "Qwen/Qwen3-Coder",
                "api": "openai-completions", "baseUrl": "http://model-gateway:8000/v1",
                "apiKeyEnv": "LOCAL_MODEL_API_KEY",
            },
            "thinkingLevel": "medium",
        }).json()
        team = client.post("/v1/teams", json={"name": "CV", "leadName": "Lead"}).json()
        employee = client.post(f"/v1/teams/{team['id']}/employees", json={
            "displayName": "Pi Worker", "runtime": "Pi", "defaultRuntimeProfileId": profile["id"],
        }).json()
        work = client.post(f"/v1/teams/{team['id']}/works", json={
            "title": "Evaluate", "goal": "summarize results", "constraints": "No fabrication",
        }).json()
        client.post(f"/v1/works/{work['id']}/assign", json={"employeeId": employee["id"]})
        run_id = client.get("/v1/runtime-runs?status=queued&adapter=pi").json()["runs"][0]["id"]

        claimed = client.post(f"/v1/runtime-runs/{run_id}/claim")
        assert claimed.status_code == 200
        spec = claimed.json()
        assert spec["runtimeProfile"]["adapter"] == "pi"
        assert spec["runtimeProfile"]["model"]["modelId"] == "Qwen/Qwen3-Coder"
        assert spec["work"]["goal"] == "summarize results"
        assert spec["employee"]["displayName"] == "Pi Worker"
        assert spec["session"]["messages"] == []

        messages = [
            {"role": "user", "content": "summarize results", "timestamp": 1},
            {"role": "assistant", "content": [{"type": "text", "text": "Evaluation complete."}], "timestamp": 2},
        ]
        completed = client.post(f"/v1/runtime-runs/{run_id}/complete", json={
            "status": "succeeded",
            "nativeSessionId": "pi-session-1",
            "messages": messages,
            "finalText": "Evaluation complete.",
            "usage": {"input": 120, "output": 20, "cacheRead": 80, "cacheWrite": 0},
        })
        assert completed.status_code == 200
        assert completed.json()["status"] == "succeeded"

        snapshot = client.get("/v1/wework").json()
        saved_employee = next(item for item in snapshot["teams"][0]["employees"] if item["id"] == employee["id"])
        assert saved_employee["activeSession"]["messages"][-1]["text"] == "Evaluation complete."

        second_work = client.post(f"/v1/teams/{team['id']}/works", json={"title": "Follow up", "goal": "continue"}).json()
        client.post(f"/v1/works/{second_work['id']}/assign", json={"employeeId": employee["id"]})
        second_run = client.get("/v1/runtime-runs?status=queued&adapter=pi").json()["runs"][0]
        second_spec = client.post(f"/v1/runtime-runs/{second_run['id']}/claim").json()
        assert second_spec["session"]["nativeSessionId"] == "pi-session-1"
        assert second_spec["session"]["messages"] == messages


def test_pi_worker_only_sees_active_work_and_context_reset_removes_checkpoint(tmp_path: Path):
    with make_client(tmp_path) as client:
        profile = client.post("/v1/runtime-profiles", json={
            "name": "Pi", "adapter": "pi",
            "model": {"provider": "openai", "modelId": "gpt-5", "apiKeyEnv": "OPENAI_API_KEY"},
        }).json()
        team = client.post("/v1/teams", json={"name": "CV", "leadName": "Lead"}).json()
        employee = client.post(f"/v1/teams/{team['id']}/employees", json={
            "displayName": "Worker", "runtime": "Pi", "defaultRuntimeProfileId": profile["id"],
        }).json()
        first = client.post(f"/v1/teams/{team['id']}/works", json={"title": "First", "goal": "one"}).json()
        second = client.post(f"/v1/teams/{team['id']}/works", json={"title": "Second", "goal": "two"}).json()
        client.post(f"/v1/works/{first['id']}/assign", json={"employeeId": employee["id"]})
        client.post(f"/v1/works/{second['id']}/assign", json={"employeeId": employee["id"]})

        eligible = client.get("/v1/runtime-runs?status=queued&adapter=pi").json()["runs"]
        assert [run["workId"] for run in eligible] == [first["id"]]
        spec = client.post(f"/v1/runtime-runs/{eligible[0]['id']}/claim").json()
        client.post(f"/v1/runtime-runs/{spec['id']}/complete", json={
            "status": "succeeded", "nativeSessionId": "native-1",
            "messages": [{"role": "assistant", "content": [{"type": "text", "text": "done"}]}],
            "finalText": "done",
        })
        assert client.post(f"/v1/employees/{employee['id']}/reset-context").status_code == 200

        eligible = client.get("/v1/runtime-runs?status=queued&adapter=pi").json()["runs"]
        assert [run["workId"] for run in eligible] == [second["id"]]
        next_spec = client.post(f"/v1/runtime-runs/{eligible[0]['id']}/claim").json()
        assert next_spec["session"]["nativeSessionId"] is None
        assert next_spec["session"]["messages"] == []


def test_team_chat_messages_persist_in_wework_snapshot(tmp_path: Path):
    with make_client(tmp_path) as client:
        team = client.post("/v1/teams", json={"name": "CV", "leadName": "Lead"}).json()
        created = client.post(f"/v1/teams/{team['id']}/messages", json={"text": "persistent team update"})
        assert created.status_code == 201

        snapshot = client.get("/v1/wework").json()
        saved = next(item for item in snapshot["teams"] if item["id"] == team["id"])
        assert [message["text"] for message in saved["teamMessages"]] == ["persistent team update"]
