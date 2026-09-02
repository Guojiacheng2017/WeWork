# WeWork Harness v1: tools, work context and delivery

## Implemented boundary

Desktop-local mode stores a device index at
`<WEWORK_CONFIG_DIR>/wework-index.json` and the current generation of each
team's durable business snapshot in
`<WEWORK_APP_DATA_DIR>/<team-id>/.wework-state/`. The Host reconstructs the
same logical WeWork snapshot for the TypeScript business API; it does not keep a
single canonical `<WEWORK_APP_DATA_DIR>/wework.json`. Electron forwards an
allowlisted `weworkCall` through its authenticated IPC/loopback bridge, and the
per-launch loopback token never enters Renderer state. Never run multiple Host
writers against the same device roots.

Remote mode continues to use its server APIs. Its workspace-assignment metadata
has a separate database migration, but remote WeWork Tools and remote workspace
content migration are not implemented. The previous in-memory
`CollaborationHarness` is not the production authority.

The store uses synchronous single-process read/modify/write, mode-0600 temporary
files, fsync, and atomic rename. Team snapshot generations are durable before
the device index is promoted, so a pre-index crash still exposes the preceding
complete snapshot. This is a first-version local registry, not a multi-process
database. Old, unreferenced generations are not automatically pruned; SQLite
migration and large binary artifact storage remain future work.

## Canonical workspace, configuration, and secrets

On macOS, the packaged Desktop app derives `~/Documents/WeWork` as the canonical
team-workspace root and `~/Documents/.wework` as the device-configuration root.
The Host permits `WEWORK_APP_DATA_DIR`/`WEWORK_CONFIG_DIR` overrides for
development or managed deployment. A stable team ID, not its display name,
names the canonical `<WeWork root>/<team-id>` directory. Team creation, member
addition, import, and startup reconciliation create the required directories
idempotently and reconcile Host-maintained `team.json`/`employee.json` metadata
on every pass. They seed `WEWORK.md` and `.wework/config.json` write-once, so
those user-editable prompt/config files are preserved; no symlinks are created.

The reviewable sync-safe candidates are team/employee manifests, their
`WEWORK.md` and `.wework/config.json` files, `team/{chat,context,plans,issues,
workflows,skills,settings}`, `shared`, and explicitly chosen artifacts. There
is no implicit file sync: use an explicit artifact/repository transfer or a
future Sync Provider, and inspect content before sharing it. The whole device
configuration root plus each `.wework-state` directory are local-only. They
contain the Host index/snapshots, checkpoint/runtime data, local harness
settings, and credential metadata; copying them between machines is unsupported.

Structured configuration merges built-ins → global → team → employee → Session
→ task. Plain objects merge recursively; a narrower scalar or array replaces a
broader value. Effective `model` values override the selected Session model,
`context.maxMessages` bounds retained messages in the portable WeWork
checkpoint; Harness-native transcript/history remains owned by that Harness, and
`permissions.network: false` confines the bundled smalldash model endpoint to
loopback. Unknown safe extension metadata remains available to future consumers.
Prompt files are not a merge layer: the non-empty global, team, and employee
`WEWORK.md` files are appended in that order, followed by the Session persona;
the task/user prompt is submitted after those system instructions. The exact workspace
order is employee assignment → team assignment → canonical team directory.
**Default** means no assignment and selects the canonical directory;
**current** means `{ kind: "local" }` and resolves the App's persisted, selected
local directory at run time (falling back to launch CWD only before the first
selection); **local** means an absolute local path; **SSH** means
host/port/user/absolute remote root plus a credential reference. An employee
with no assignment inherits the team setting. The Host fails closed rather than
substituting a different directory when canonical/current resolution fails.
SSH metadata already present in state remains visible so it can be cleared or
repaired, but the UI prevents new SSH assignment while no shipped Harness has a
remote execution adapter. Probing connectivity is not an execution capability.
Skill discovery and execution use the same deterministic lookup order:
canonical employee `skills/` → canonical team `team/skills/` → selected
workspace `skills/` → bundled WeWork Skills. The first Skill with a given ID
wins, so an employee can specialize a team Skill without discovery/execution
drift. Remote Desktop metadata initializes its canonical employee directory
before discovery; SSH workspace Skill scanning remains unavailable.

Configuration and team state never contain raw model keys, SSH passwords, or
private keys. They may contain only a validated opaque `credentialRef`; the
Host resolves it through the device Vault and verifies an SSH reference exists
with SSH-password/private-key kind before saving, probing, or preparing a run.
Model execution and endpoint probing accept only Vault metadata with
`model-api-key` kind. A model may select exactly one credential source:
`credentialRef` or `apiKeyEnv`, never both. `apiKeyEnv` accepts only the explicit model-key names
`WEWORK_MODEL_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
`AZURE_OPENAI_API_KEY`, `DASHSCOPE_API_KEY`, `QWEN_API_KEY`, `GOOGLE_API_KEY`,
`GEMINI_API_KEY`, or the legacy development name `LOCAL_MODEL_API_KEY`; Host bearer/internal variables and arbitrary inherited
environment names are never model credentials.
macOS currently stores secret material in Keychain. `apiKeyEnv` is permitted
only as a development/migration fallback and holds an environment-variable name,
not a secret. `credentials.json` stores local metadata (reference, label, kind)
only and must not be synchronized.

At startup, an existing canonical device index wins. Otherwise the Host first
imports the prior packaged Desktop store at
`~/Documents/WeWork/{wework-index.json,teams/**,wework.json}`, then checks the
older `~/.wework` store. Partitioned indexes take precedence over their
monolithic `wework.json`; monoliths receive an unchanged
`wework.json.v1.backup`. Legacy inputs are never overwritten. Before a bundled
smalldash Session continues, its exact native Session file is copied, only when
the destination is absent, from the corresponding legacy `smalldash/sessions`
directory into `Documents/.wework/runtime-data`. Invalid legacy Session files
are quarantined and never replace a current Session. Reconciliation then builds
the missing canonical tree while preserving custom prompts/configuration.
If a higher-priority authoritative legacy source exists but is corrupt, import
fails closed so an older source cannot silently conceal the damaged newer state.

## Identity and execution

Each imported/new team has a stable `weworkSessionId` (one group session per team in v1). Host-managed task execution resolves employee, work and runtime profile from Host records; Renderer-provided personas and profiles are ignored. Task executions and general conversations use different checkpoint keys. Follow-up messages in an active task continue that task and include the latest context and user request.

Tools receive employee/run identity through closures, never through model parameters. Every call verifies membership and current assignment. Document/progress/submission writes additionally enforce the assignee at the business layer. No generic UI RPC tool is given to the model. Credentials are resolved separately by the vault and are never put into WeWork tool payloads.

Pi is the only adapter wired to the new WeWork tool set. smalldash receives the task brief but has no WeWork tool transport yet. Claude Code, Codex CLI and Gemini CLI tool integration is not implemented here. No live paid provider execution has been used to validate this release.

## Tools

| Tool | Behavior |
| --- | --- |
| `wework_get_team` | Minimal roster, group ID; no private employee messages or runtime credentials |
| `wework_list_tasks` | Team task titles, assignees and status |
| `wework_get_task_context` | Current task brief, recent progress and exact document revision references |
| `wework_read_task_field` | Read omitted goal, constraints or acceptance criteria in pages |
| `wework_read_document` | Read current task document by immutable ID, 8,000-character pages |
| `wework_report_progress` | Append summary, blockers and next action with actor/run provenance |
| `wework_save_output` | Create an output revision; cannot write inputs or confirmed decisions |
| `wework_submit_deliverable` | Submit output IDs, verification evidence and known issues for human review |
| `wework_send_team_message` | Publish as the bound employee, with source run ID; mentions do not auto-dispatch |
| `wework_request_handoff` | Record target and reason in progress; human reassignment is still required |

General conversations receive only the team-read tool. Agent writes cannot accept deliveries or mark tasks complete. User operations such as team membership, assignment, document input and review remain UI/API operations in v1, rather than unrestricted management tools.

## Context policy

The task is the context boundary. Inputs, decisions and outputs are immutable document revisions with a `previousId` link; saving against an already superseded revision fails. Context selects up to eight current documents and three recent progress reports, with bounded excerpts. Omitted IDs and truncation flags are explicit. Older exact document IDs remain readable within the same task. Documents are source data, not system instructions.

A run persists the injected `weworkContext`, including its manifest. Deliveries capture the exact input/decision IDs and task definition at submission. If task inputs change during execution, the submit tool requires a fresh context read before accepting submission. Reviews reject an outdated input snapshot or a superseded delivery. Editing inputs after approval invalidates completion until a new delivery is reviewed.

There is no LLM-based context summarizer, vector index or automatic compaction. The initial implementation sends a bounded current brief on each run; incremental manifest delivery and fine-grained read auditing are future optimizations. Native checkpoint history can still grow. Document contents must not contain credentials; arbitrary user-authored text is not a secret vault.

## UI workflow

1. Create and assign a task using the existing WeWork UI.
2. Open the employee workbench. Under **任务上下文与交付**, save input material or a confirmed decision. Inputs can also be created before assignment through the API.
3. Send the employee a follow-up to read the inputs and perform the task. Pi can report progress, create output documents and submit evidence through its tools.
4. Inspect document versions and the latest delivery. Fill in review feedback and choose **验收通过** or **要求修改**. Wait for the active run to stop before reviewing.
5. If changes are needed, send a follow-up; it continues the task. After acceptance, **标记完成** advances the queue using the existing workflow.

Manual output documents and **手动提交交付** are available for browser-local mode and adapters without tool support. Runtime success never auto-completes a local task. Failed or cancelled execution keeps the task available for inspection rather than silently accepting it.

## Shared API additions

- `getWorkContext(workId)` / `getWorkRecords(workId)`
- `saveWorkDocument(workId, {title,content,kind,previousId?})`
- `readWorkDocument(workId,documentId,offset=0)`
- `reportProgress(workId,{summary,blockers?,nextStep?})`
- `submitDeliverable(workId,{summary,documentIds,evidence,knownIssues?})`
- `reviewDeliverable(workId,{deliverableId,decision,feedback})`

These methods use the same local transaction boundary in browser and Host. Review has no model-facing tool. User identity in local mode means the authenticated desktop owner; multi-user reviewer roles and server-side ACLs are not implemented by this change.

## Validation and development

```sh
npm test
npm run build
npm run package
git diff --check
```

`npm test` is the full maintained test command: Web, Runtime, Desktop, and the
Python server suite. `npm run server:test` may be used for the server alone.

Runtime tests exercise an actual temporary file store and fake Agent tool calls, assignment/cancellation rejection, checkpoint isolation, persistent delivery and explicit review. Browser API tests exercise migration without overwriting Host data, immutable revisions and acceptance invalidation. Desktop development bundles the runtime before starting it so Electron need not interpret TypeScript directly.

Known follow-ups: multiple group sessions per team; binary artifact registration and verified content hashes; formal accepted/rejected handoff objects; automatic @ dispatch; remote API parity; external Harness tool transports; crash reconciliation of interrupted processes. Existing unrelated README/package edits are intentionally preserved.

## Cross-Harness Session policy

A Session keeps one Harness identity. Changing models inside that Harness is allowed: the Harness retains its native session, transcript and compaction behavior. Once a Session contains messages, metrics or consumed context, changing its Harness in place is rejected with `SESSION_HARNESS_IMMUTABLE`. The UI applies the same lock. Resetting context creates a fresh Session and may therefore select another Harness.

The effective WeWork configuration may refine supported runtime fields, but its
`harness.id` is an assertion against the selected Session Harness. A mismatch
fails closed; configuration cannot use that field to switch the Session to a
different adapter. WeWork-managed catalog defaults likewise point only to
Host-verified model connections. Tampered or legacy verification claims are
quarantined/demoted and require a fresh Host probe.

The planned migration path is an explicit **Fork to new Session**, never checkpoint reuse:

1. Preserve the source Session and its Harness unchanged.
2. Produce a structured handoff containing the current objective and constraints, completed and remaining work, key decisions, required document/task/artifact references, and only the necessary group-chat bubble references.
3. Allocate a new WeWork Session ID and let the destination Harness create its own native session ID.
4. Inject only the portable handoff and authorized references. Do not copy native checkpoints, hidden transcripts, provider state, tool-call state, credentials or compaction internals across Harnesses.
5. From that point, the destination Harness owns model selection, native context and compaction for the forked Session.

The fork should record provenance (`sourceWeWorkSessionId`, source Harness, creation time and referenced message/document IDs) so the transition can be audited without coupling the two native sessions. Until that explicit fork workflow exists, users must reset the employee context before selecting another Harness.


## September 1 collaboration core update

Public group chat now uses `postGroupMessage(teamId,{text,recipientId?,requestId,replyToMessageId?})`. The unique team lead is the fallback recipient. Message and inbox entry are persisted in one transaction; duplicate request IDs reuse the result and conflicting payloads fail. Normal employee progress messages do not dispatch agents. Explicit `wework_request_collaboration` calls are bounded to depth 2 and 8 deliveries per root request. Group context follows public reply ancestry, with paged message reads; employee private/task histories are excluded.

`CollaborationCoordinator({wework,runtime})` owns Host dispatch and terminal reconciliation. Attach with `wework.attachCoordinator(coordinator)`, then call `recover()`. All managed startup uses `wework.startRun(spec,runtime)` to fence admission against ownership transitions. `close()` stops reconciliation timers. Group results publish only after a durable terminal runtime result, once per run, without writing to private workbench messages. Missing/unconfirmed executions become `uncertain` and never replay automatically. Explicit retry is supported for `failed` deliveries, not uncertain ones.

`requestHandoff(workId,{targetEmployeeId,note},actor?)` persists a formal request; `decideHandoff(teamId,{handoffId,decision})` is user-only. Host acceptance waits for `runtime.cancelAndWait` and revalidates current ownership atomically. Timeout or unresolved execution keeps ownership unchanged. Work records survive transfer and cancellation. Cancelled tasks remain in `team.cancelledWorks` with `cancelledAt` and cannot be reassigned or edited; the legacy status remains `blocked` for compatibility.

Core validation adds 6 local collaboration and 7 coordinator tests, including actual RuntimeManager cancellation and terminal persistence. One additional integration test runs the real sdh child process and IPC WeWork tools against a local model-response fixture, validates group reply persistence and native-session continuation, and checks that private workbench content never enters model requests. This is not a paid/provider model test. UI and external/native adapters are integrated and validated by the paired WeWork-Frontent task; previous Pi-only adapter statements above describe the August 31 baseline, not a claim about the paired task's final capabilities. No additional task or sub-agent was used for this core update.

`cancelGroupDelivery(teamId,deliveryId)` provides explicit cancellation without deleting the public message. Browser-local storage can cancel queued entries only; Host routes running entries through `cancelAndWait` and persists the actual terminal outcome. Timeout keeps the delivery active, and uncertain execution is never silently cancelled. Already-terminal entries are returned unchanged by the Host. This also allows cancelling a browser-created queued entry before migrating it into a running Host.
