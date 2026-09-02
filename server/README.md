# WeWork Server

The optional collaboration backend under the unified WeWork project. It owns teams, employees,
work distribution, workflows, employee messages, runtime-run records, artifacts,
and the durable event stream. It communicates only with the end-side WeWork App;
it never connects to employee workspaces, SSH hosts, model providers, or harnesses.

## Local development

```bash
python3 -m venv server/.venv
server/.venv/bin/pip install -r server/requirements.txt
DATABASE_URL=sqlite:///./server/data/wework.db server/.venv/bin/alembic -c server/alembic.ini upgrade head
npm run server:dev
```

The Vite dev server proxies `/wework-api` to the isolated host port 8791.
PostgreSQL and MinIO are started only through this directory's Compose file:

```bash
docker compose -f server/docker-compose.yml up -d --build
```

The Compose project, network, database volume, artifact volume, bucket, and
host port are all WeWork-V2-specific. Root-level harness/workspace services and
other dashboard development tasks are not shared or restarted.

## Boundaries

- WeWork App ↔ WeWork Server: REST mutations, snapshot reads, durable run/session
  checkpoints, artifact metadata, and SSE events.
- WeWork App Runtime Host ↔ harness/model: Pi SDK now; other harness adapters later.
- WeWork App Workspace Manager ↔ workspace: local directory by default, or an
  explicitly configured remote SSH workspace.
- Artifact bytes: MinIO/S3; artifact metadata and provenance: PostgreSQL.

`wework-server` stores orchestration state, but does not perform orchestration
side effects. Runtime claim/complete endpoints are consumed by the WeWork App's
local Runtime Host, not by a server-side worker.

## Pi SDK runtime

Create a runtime profile with `POST /v1/runtime-profiles`, then set its id as
`defaultRuntimeProfileId` on an employee or `runtimeProfileId` on a work item.
Resolution is explicit and deterministic:

1. work item `runtimeProfileId`
2. employee `defaultRuntimeProfileId`
3. team `defaultRuntimeProfileId`

Pi employees without an enabled Pi profile are rejected at assignment time.
The scheduler only queues work; the WeWork App Runtime Host claims the run, restores the
employee/profile checkpoint, invokes Pi, and atomically returns the transcript,
usage, final message, and native session id. Harness switching is supported at
run boundaries because the persisted checkpoint is portable JSON; an active run
is never migrated in place.

Profiles store only a credential reference, never model or SSH secrets. The
WeWork App resolves that reference from its local keychain/environment.

Workspace assignment is also end-side. When no workspace is selected, the App
uses a local directory. When remote SSH is selected, the App connects with the
saved host/user/root metadata and resolves password/private-key material from
local secure storage. SSH passwords and private keys must never be sent to or
persisted by `wework-server`.

Schema changes must be applied through Alembic. SQLite and local filesystem
storage are development/test fallbacks only.

On the first browser connection, an entirely empty WeWork database accepts a
one-time bootstrap import from `wework/src/data/mockData.ts`. The
endpoint becomes a no-op as soon as any team exists, so later restarts and UI
sessions cannot overwrite persisted user data.

## Workflow concurrency contract

- Node layout is canonical shared workflow data: `position: {"x": number, "y": number}`.
- Incoming edges are canonical in `requires`.
- `GET /v1/teams/{team_id}/workflow` returns the workflow and `ETag: "<version>"`.
- Creating a workflow may omit a version. Updating one requires either
  `If-Match: "<version>"` or the same numeric `version` in the JSON body.
- A stale write returns `409` with `detail.currentVersion`; a missing
  precondition returns `428`. Successful writes return the incremented version
  in both the response body and ETag.
- `workflow.saved` events contain `teamId`, `workflowId`, and `version`.
  SSE reconnects honor `Last-Event-ID` to prevent unnecessary replay.
