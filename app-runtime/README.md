# WeWork App Runtime Host

This package is an end-side component of the WeWork App. It is not an
`wework-server` service and is intentionally absent from the backend Compose
stack.

## Run the Node sidecar

```bash
WEWORK_HOST_TOKEN="$(openssl rand -hex 32)" npm start
```

The process binds only to `127.0.0.1` and prints one JSON ready record containing
only its URL. The desktop launcher creates the token before spawning the Host,
keeps URL/token in the Electron main process, and exposes only an allow-listed
IPC API to the renderer. Neither value enters logs, renderer state, or team state.
State defaults to `~/.wework` and can be redirected with
`WEWORK_APP_DATA_DIR`.

Bridge endpoints (all require `Authorization: Bearer <token>`):

- `GET /v1/health`
- `GET /v1/workspaces/current`
- `POST /v1/workspaces/local/choose`
- `GET|POST /v1/credentials`
- `POST /v1/workspaces/ssh/probe`
- `POST /v1/runs`
- `GET /v1/runs/:id`
- `POST /v1/runs/:id/cancel`
- `GET /v1/events` with `Last-Event-ID`

Stable errors include `HOST_UNAUTHORIZED`, `HOST_UNAVAILABLE`,
`CREDENTIAL_MISSING`, `RUNTIME_PROFILE_MISSING`, `RUN_ALREADY_ACTIVE`,
`RUN_NOT_ACTIVE`, and `VERSION_CONFLICT`.

Responsibilities:

- claim/complete durable runs through the WeWork App ↔ WeWork Server API;
- restore portable employee session checkpoints;
- load the manually selected harness and model profile;
- ask the WeWork App Workspace Manager for the assigned workspace;
- invoke Pi SDK and return transcript, usage, events, and artifacts.

Workspace resolution happens before harness startup:

1. no workspace assignment: use the WeWork App's selected local directory;
2. local assignment: use its explicit local directory;
3. remote assignment: connect over SSH using host, port, username, and remote
   root; resolve password/private key via an app-local credential reference.

The WeWork Server receives only non-secret workspace identity/provenance when
needed for synchronization. Passwords, private keys, model API keys, live SSH
connections, and mounted workspace contents remain on the endpoint.

## State ownership and conflict policy

- Local Service is authoritative for teams, employees, Runtime Profiles,
  Workspace Assignments, work, workflow, group messages, and local artifact
  references in local-first mode.
- Runtime sidecar is authoritative for active/terminal Run state and portable
  checkpoints. Files are written atomically with mode `0600`.
- macOS Keychain is authoritative for SSH/model secrets. Team state contains
  only `credentialRef`; `apiKeyEnv` remains a development/migration fallback.
- WeWork Server remains an optional collaboration provider. Workflow updates
  use versions/If-Match; conflicts are surfaced as `VERSION_CONFLICT` and are
  never silently last-write-wins.

The Electron launcher lives in `../desktop`. It supervises the sidecar
restart/cleanup, rotates tokens, provides the sandboxed preload bridge, bundles
the Pi runtime for packaging, and produces an unsigned development `.app`.
