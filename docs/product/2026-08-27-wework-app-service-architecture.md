# WeWork App + Service Architecture

## 1. Product invariant

WeWork is a workspace for one user to create and manage teams of digital
employees. A team remains the primary aggregate: employees, roles, persona,
workflow, group conversation, work, sessions, and artifacts all belong to a
team. The first release has one controlling account; future human collaborators
delegate ownership or execution without replacing this model.

## 2. Four boundaries

### WeWork App (required, local TypeScript)

- Team/employee/workflow/workbench UI.
- Local Store: teams, employees, tasks, workflow, messages, artifact index,
  runtime profiles, and session checkpoints.
- Scheduler: promotes queued work and creates a Run intent.
- Runtime Host: loads the selected harness adapter and manages its session.
- Workspace Manager: resolves the employee's local or SSH workspace before a
  harness starts.
- Credential Vault: model keys and SSH password/private keys remain on-device.

The complete single-user product works with this layer alone.

### User-controlled execution resources (optional per employee/run)

- Default workspace: the canonical `Documents/WeWork/<team-id>` directory when
  neither the employee nor team has an assignment.
- Current local workspace: an explicit rootless local assignment
  (`{ kind: "local" }`) resolved from the App's currently selected directory at
  run start.
- Remote workspace: an SSH host/root controlled by the user's account.
- Model provider: local model, provider API, or enterprise model gateway.
- Harness: Pi first; Codex CLI, Claude Code/SDK, and DSH through adapters later.

These resources are not WeWork backend infrastructure.

### Collaboration Service (optional, future)

- Account, team invitation, membership, and permission.
- Realtime group chat/presence and multi-writer conflict/lease coordination.
- Encrypted state synchronization between a user's devices and team members.
- Optional managed Runner for work that must continue while a member is offline.

The App depends on a `SyncProvider` abstraction, not one mandatory WeWork
Server. A local no-op provider is the default.

### Shared artifact targets (optional, team-selected)

- Git for code, text, configuration, reviewable changes, and small reports.
- Object storage for large/binary artifacts.
- An existing team remote workspace when outputs are meant to land there.

WeWork records artifact identity, provenance, hash, and target reference. It
does not require artifacts to be uploaded to an WeWork-owned store.

## 3. Ownership model

| Entity | Current owner | Future extension |
| --- | --- | --- |
| Team | controlling user account | members + roles |
| Digital employee | team, administered by user | delegated administrator |
| Runtime process | executing account/device | account-owned remote runner |
| Workspace | executing account by default | team workspace assignment |
| Session checkpoint | local device by default | encrypted selective sync |
| Shared artifact | team-selected target | Git/object store/custom target |
| Model/SSH secret | local Credential Vault | enterprise secret provider |

## 4. Execution path

1. User creates a Team and Digital Employee.
2. User configures Persona and a default Runtime Profile.
3. User may assign a Workspace. Omission means the canonical
   `Documents/WeWork/<team-id>` directory; only an explicit rootless local
   assignment means the App's selected current directory.
4. User/group chat creates or assigns a Work item.
5. Scheduler promotes the employee's next Work item.
6. Workspace Manager resolves local directory or SSH connection.
7. Runtime Host loads the manually selected Harness adapter.
8. Session Coordinator restores the employee/profile checkpoint and starts a
   Run against the resolved workspace.
9. Harness events update the workbench; checkpoint and artifact metadata are
   written to Local Store.
10. Explicitly shared artifacts are published to the Team's configured target.
11. If a Sync Provider is enabled, selected team state/events are synchronized.

## 5. Harness/session rules

- Harness selection is manual with team/employee defaults and work-level
  override; Scheduler does not make an intelligent harness choice.
- A running Run is never hot-migrated. Harness/model switching occurs at a Run
  boundary using a portable summary/checkpoint.
- Harness-native history may remain adapter-specific. The portable checkpoint
  contains normalized messages, summary, artifact references, and provenance;
  `context.maxMessages` bounds only its retained message list.
- An effective `harness.id` is an assertion against the Session Harness, not a
  runtime switch. A mismatch fails closed.
- Provider KV cache is an optimization tied to provider/model/session affinity,
  not the source of truth. Switching model may lose KV cache but not context.

## 6. TypeScript interfaces

```ts
interface WorkspaceProvider {
  resolve(assignment?: WorkspaceAssignment): Promise<ResolvedWorkspace>;
}

interface RuntimeAdapter {
  start(spec: RunSpec, checkpoint: SessionCheckpoint, workspace: ResolvedWorkspace): Promise<RunHandle>;
  cancel(handle: RunHandle): Promise<void>;
}

interface SyncProvider {
  push(events: TeamEvent[]): Promise<SyncCursor>;
  pull(cursor?: SyncCursor): Promise<TeamEvent[]>;
}

interface ArtifactTarget {
  publish(artifact: LocalArtifact, context: PublishContext): Promise<ArtifactRef>;
}
```

## 7. Delivery sequence

1. Local Team domain and durable TypeScript Local Store.
2. Local Workspace Provider and Pi Runtime Adapter.
3. Session checkpoint, scheduler, workbench events, and local artifacts.
4. Explicit artifact publication targets.
5. Optional account/collaboration Sync Provider.
6. Optional remote/managed Runner.

`wework-server` is not on the critical path for stages 1–4. It may later become
one implementation of the collaboration/model-gateway capabilities, but must
not own local workspace or runtime execution.

## 8. Implemented endpoint bridge

The desktop boundary is currently a Node sidecar in `wework-app-runtime`. It
binds to loopback only, requires a per-launch bearer token, owns macOS directory
selection, Keychain, OpenSSH probes, Pi execution, cancellation, monotonic event
cursors, and atomic Run/checkpoint files. The renderer uses
`LoopbackWeWorkHost`; `LocalRunScheduler` is the only component allowed to turn
the current employee work item into a RunSpec.

This is deliberately separate from `wework-server`. Packaging the sidecar into
a signed Electron/Tauri shell is a distribution task, not an architecture
change.

## 9. Workspace and configuration layout

WeWork keeps device configuration separate from canonical team workspaces. In
the packaged macOS app the Electron Documents directory supplies these defaults:
`~/Documents/.wework` for device configuration and `~/Documents/WeWork` for
team workspaces. The sidecar also accepts `WEWORK_CONFIG_DIR` and
`WEWORK_APP_DATA_DIR` for development/controlled deployments. The current
native directory picker and Keychain vault are macOS implementations; a Windows
directory package can be built, but it does not yet provide those native
features.

```text
Documents/
├── .wework/                                # device-local; do not generic-sync
│   ├── config.json, WEWORK.md              # global defaults/instructions
│   ├── wework-index.json                   # index for current team snapshots
│   ├── credentials.json                    # Keychain metadata only, never secrets
│   ├── harness-policy.json, harness-models.json
│   ├── runtime/                            # checkpoints and run state
│   └── runtime-data/
└── WeWork/
    └── <team-id>/                          # stable ID, never display name
        ├── team.json, WEWORK.md, .wework/config.json
        ├── team/{chat,context,plans,issues,workflows,skills,settings}/
        ├── employees/<employee-id>/
        │   ├── employee.json, WEWORK.md, .wework/config.json
        │   └── {context,sessions,skills,workspace,artifacts}/
        ├── shared/, artifacts/
        └── .wework-state/                  # Host snapshot generations; local-only
```

`team.json`/`employee.json`, team content, `shared`, explicit artifacts, and
the team/employee `WEWORK.md` and `.wework/config.json` files are the
reviewable, sync-safe *candidates*. Selecting a workspace never uploads or
downloads them: repository/artifact transfer and any future `SyncProvider` are
explicit operations. Before sharing artifacts, users must still verify that the
contents contain no sensitive data. Do not file-sync `.wework-state` or any of
`Documents/.wework`: they are a single-device Host store, generation index,
run/checkpoint data, local harness settings, or device defaults. Copying them
between machines would bypass the Host's atomic index promotion and is not a
supported synchronization mechanism.

Configuration starts with built-ins and deep-merges, in order: global
`Documents/.wework/config.json` → team `.wework/config.json` → employee
`.wework/config.json` → Session config → task config. At a conflicting scalar
or array the narrower layer replaces the broader value; objects merge by field.
`WEWORK.md` is separate: non-empty global, team, then employee prompts are
appended in that order, followed by the Session system instruction; the task
prompt is submitted afterward. Session/task values have no prompt-file layer.

Workspace resolution is also exact and independent of configuration precedence:
employee assignment → team assignment → canonical
`Documents/WeWork/<team-id>`. The four UI choices mean: **default** stores no
assignment and uses that canonical team directory; **current** stores a local
assignment without `rootPath` and resolves to the App's persisted selected local directory
when the run starts; **local** stores an absolute local `rootPath`; and **SSH**
stores host, port, username, absolute remote root, and a credential reference.
Thus an employee in default mode inherits its team's current/local/SSH setting;
only an employee assignment overrides it. Resolution fails closed if the Host
cannot provide the canonical root or current directory.
Existing SSH metadata remains loadable for repair, but the current UI prevents
new SSH assignment because no shipped Harness has an SSH execution adapter.
Skill discovery and runtime loading share one precedence order: employee
`skills/`, team `team/skills/`, selected workspace `skills/`, then bundled
WeWork Skills. Duplicate IDs resolve to the first location. Desktop metadata
discovery initializes the canonical employee tree even when the remote API
snapshot is not duplicated into the Host.

The resolver rejects secret-shaped configuration fields. Model keys, SSH
passwords, and private keys are held in the device Credential Vault (macOS
Keychain today). State/configuration records contain only a validated opaque
`credentialRef`, and an SSH assignment is accepted on a device only when that
reference exists there with SSH-password or SSH-private-key kind. A model may
instead contain an `apiKeyEnv` name as a development/migration fallback, but
the two credential sources are mutually exclusive; the environment field is an
environment-variable name, not the key. `credentials.json` contains only local
reference/label/kind metadata and is not sync-safe. Model execution/probing
accepts only Vault entries of `model-api-key` kind or the explicit model-key
environment allowlist; `WEWORK_HOST_*` variables are never model credentials
and are removed from every child-process environment.

The canonical team directory is created from a stable team ID, not a mutable
display name. Adding an existing employee creates a new team-scoped employee
directory; WeWork does not silently create symlinks. On startup, the Host first
uses an existing canonical device index. If absent, it imports a legacy
partitioned index from the actual prior packaged `Documents/WeWork` store,
falling back to its monolithic `wework.json`, and then repeats the lookup under
`~/.wework`; a monolith is preserved once as `wework.json.v1.backup`.
Legacy sources are never overwritten. Imported/current teams are reconciled
idempotently so manifests, directories, and default config/prompt files exist
without overwriting user-edited prompt/config files. Team snapshot generations
are written and fsynced before the device index is atomically promoted; stale,
unreferenced generations are intentionally retained for now.
An existing but corrupt higher-priority legacy source fails migration closed;
the Host does not mask it by importing an older fallback. WeWork-managed model
catalog defaults are sanitized to Host-verified connections only, and any
legacy/tampered verification claim is quarantined or demoted.
Before a bundled smalldash continuation, the exact native Session file is
copy-migrated from the old data root only when the new destination is absent;
invalid sources are quarantined and a newer destination always wins.

`npm run package` runs the web production build and Electron's unsigned
directory package. It bundles the compiled sidecar plus its runner/extensions
under the app's `Resources/wework-app-runtime` and the web build under
`Resources/wework-ui`; on Apple Silicon the unpacked app is normally
`desktop/dist/mac-arm64/WeWork.app`. Directory packaging intentionally
does not sign or notarize the app. A distribution build needs an Apple signing
identity and notarization policy.

## 10. Collaboration harness

The executable contract lives in `src/runtime/collaborationHarness.ts`.
Agents never mutate the React Store or drive UI controls. Each run receives an
`AgentIdentity` scoped to one Team and Employee plus an immutable
`HarnessPolicy`. WeWork-native tools cover team discovery, Issue listing and
claiming, status updates, Team messages, artifact publication, and Handoff.

Issue claim is an atomic repository operation. Agent-to-agent coordination is
represented by durable Team entities and `CollaborationEvent`; direct runtime
calls between agents are not part of the contract. External capabilities use a
separate `ExternalToolGateway`, intended for allowlisted MCP server adapters.
Model, SSH, and other secrets remain in the Desktop Host and are never included
in tool inputs or collaboration events.
