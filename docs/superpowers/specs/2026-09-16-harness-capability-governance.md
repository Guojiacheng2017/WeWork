# Harness Capability Governance

## Boundary

Harnesses execute work. WeWork decides which capabilities exist in a run. Team policy decides which information is visible. The Capability Broker authorizes and audits every external capability call.

Connecting or allowing a Harness never authorizes its ambient MCP servers, plugins, extensions, skills, native tools, prompt templates, context files or context providers. Discovery records capabilities; it does not activate them. Newly discovered capabilities start as `unreviewed`.

## Current implementation audit

| Area | Current behavior | Gap |
| --- | --- | --- |
| Harness policy | Device-level `allowedHarnesses`; currently only Pi and SDH survive persistence | No team, employee or task capability grants |
| Pi startup | WeWork extension plus assigned business Skills; native tool admission hook | Before this change, Pi also discovered ambient extensions, Skills, prompt templates and context files. Production admission controls some tool execution but is not an information-isolation boundary |
| WeWork tools | Closure-bound employee/run identity and Session permission mode checks | Tool catalog is not derived from a four-layer immutable grant; `wework_get_team` exposes every member's Skills and current task goal |
| Plugin registry | Device enable flag, team enable/configuration, MCP tool permission metadata and per-call Vault resolution | New plugins are effectively device-enabled unless disabled; no `unreviewed` state, employee/task grants, data scopes, network policy, confirmation workflow or complete audit log |
| Skills | Explicit employee assignment and approved filesystem roots | No common catalog for Harness-native Skills or reviewed version/hash record |
| Runtime | Adapter/profile checkpoint isolation and cancellation fencing | No unified live capability/data authorization path |

The immediate Pi correction launches production runs with `--no-extensions --no-skills --no-prompt-templates --no-context-files`. Pi documents that explicit `--extension` paths still load with discovery disabled, so only the run-scoped WeWork bridge remains. Native built-in tools stay subject to the current admission hook until strict-mode tool grants replace it.

## Capability Catalog

Every discovered item is normalized to:

```ts
type HarnessCapability = {
  id: string;                       // stable: <harness>/<type>/<native-id>
  type: 'mcp-tool' | 'plugin' | 'skill' | 'native-tool' | 'context-provider';
  harness: HarnessId;
  nativeId: string;
  harnessVersion: string;
  version?: string;
  contentHash?: string;
  permissions: string[];
  dataScopes: DataClass[];
  sideEffect: 'none' | 'local-read' | 'local-write' | 'external-read' | 'external-write';
  confirmation: 'never' | 'external-write' | 'always';
  network: 'none' | 'restricted' | 'public';
  trust: 'unreviewed' | 'approved' | 'denied' | 'revoked';
  discoveredAt: string;
};
```

Discovery adapters may read only machine-readable capability metadata. They must not execute a capability, authenticate to a new service, or ingest its content into a run. Harness-native Skills remain catalog entries. An approved Skill becomes WeWork-managed only after its exact content is copied into an approved root, hashed, reviewed and registered as a new immutable version.

## Layered grants

Authorization is set intersection:

```text
effective = device-approved ∩ team-allowed ∩ employee-enabled ∩ task-allowed
```

- Device policy authorizes a Harness to run and approves specific capability versions.
- Team policy constrains capabilities, data classes, network and side effects for that team.
- Employee policy enables a subset for that employee and role.
- Task policy may only remove capabilities or narrow data/network/write scope.

No lower layer can add an ID or permission absent from a higher layer. Missing policy means deny, except migrated built-in WeWork read tools explicitly listed by the migration policy.

## Data classification

All broker-visible data is labeled as one of:

- `public`
- `team-internal`
- `role-restricted`
- `task-scoped`
- `employee-private`
- `secret`

The default Harness view contains the current employee identity, current task fields explicitly granted to that run, assigned attachment/artifact references and the minimum reply ancestry required for a group delivery. It excludes the full team snapshot, unrelated group history, private chats, other employees' context/Skills/tasks, unassigned attachments, credentials, secret values and unnecessary absolute paths.

`wework_get_team` must return a policy-projected directory. In strict mode it returns only the current employee plus minimal IDs/names needed for explicitly allowed collaboration; it never returns member Skills or task goals.

## Strict and isolated modes

`strict` mode:

- disable ambient Harness Skills, extensions, plugins, MCP, prompt templates and context files;
- expose only reviewed capabilities explicitly injected by WeWork;
- deny team data unless granted to the current employee/task;
- default network to `none`;
- require confirmation for external writes.

`isolated` mode is stricter:

- no network and no external MCP;
- no complete team member list or historical chat;
- task inputs are read-only;
- filesystem access is limited to an assigned workspace/input view;
- outputs may be written only through the designated delivery tool/area.

Strictness is a team ceiling and may be increased by employee/task policy. A task cannot relax it.

## Capability Broker

Every MCP/plugin/external native-tool call flows through one broker:

1. Verify the active Session/run identity and compute the effective grant from current policy references.
2. Recheck current emergency revocation for capability, network and credential use.
3. Validate declared permission, data class, side effect and confirmation requirement.
4. Project and size-limit input data.
5. Resolve an allowed Vault reference for this call only; never place long-lived credentials in Harness environment, prompt, checkpoint or capability catalog.
6. Invoke the provider with a deadline and cancellation signal.
7. Filter/classify output before returning it to the Harness.
8. Append an audit event containing run/capability/version, decision, input/output classifications, side-effect class, confirmation and result metadata. Never log secret values.

MCP tools lacking complete permission, data-scope, side-effect and confirmation declarations remain `unreviewed` and cannot run.

## Session binding, live authorization and revocation

WeWork must not create per-run or per-Session copies of messages, context, documents, Skills, capability catalogs or policy grants. There is no persisted `RunGrantSnapshot` or equivalent receipt. The durable Session record contains only its existing Harness/native-session binding and references to device/team/employee/task policy records.

At process start the policy compiler builds an in-memory effective grant. The Capability Broker recomputes or validates the relevant current policy versions on every call, so emergency revocation is immediate. Skill/prompt content is read from the single approved content-addressed catalog entry by hash; it is never copied into a run directory. If policy changes invalidate the in-memory grant, subsequent calls fail or the run is cancelled according to policy.

Audit storage is a bounded rolling log of decisions, not a state snapshot. It records IDs, hashes, decision and timestamps only; it never stores Session messages or capability payloads. Retention and byte limits are mandatory.

## Implementation phases

1. **Contain ambient capability:** ship Pi discovery-disable flags; require equivalent flags/config overlays in Claude Code and Codex adapters.
2. **Catalog and review state:** add device catalog persistence, safe discovery adapters and explicit approve/deny/revoke operations. Migrate plugins to default `unreviewed`.
3. **Layered policy compiler:** add device/team/employee/task policy records and a pure intersection compiler with deny-by-default tests.
4. **Data projection:** classify stored resources and make all WeWork context/tool responses consume the compiled data grant. Fix `wework_get_team` first.
5. **Broker:** route plugin/MCP/external calls through a single per-call authorization, Vault, filtering and audit boundary.
6. **Live grants:** compile grants in memory, keep only policy references on the Session, and recheck emergency revocation on every Broker call; do not create per-run state copies.
7. **Strict/isolated enforcement:** make strict the recommended team mode, add isolated workspace/network/output enforcement and end-to-end exfiltration tests.

## Acceptance criteria

- A newly installed Harness capability cannot appear in an employee run without review and all four grants.
- Enabling a Harness does not enable any of its native capabilities.
- Strict Pi/Claude/Codex runs load no ambient configuration and receive no ungranted team data.
- A forged, stale, revoked or out-of-scope broker call fails before provider invocation.
- Credentials are absent from Harness argv/env/prompts/checkpoints/audit logs.
- Every allowed external call has an auditable decision tied to the Session and current policy versions, without copying Session state.
- Cross-team, cross-employee, unrelated-chat and unassigned-attachment leakage tests pass.
