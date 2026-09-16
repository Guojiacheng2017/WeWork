# WeWork Harness Protocol and Adapter Contract

## Decision

WeWork core will not contain one permanent integration branch per Harness. All Harnesses, including Pi, SDH, Claude Code, Codex CLI and Gemini CLI, register through one Adapter Registry and satisfy the versioned **WeWork Harness Protocol (WHP)**. Built-in adapters are packages shipped with WeWork; future adapters may be installed separately, but installation only discovers an unreviewed adapter and its capabilities.

A Harness that implements WHP may connect directly. A Harness with another native API uses a thin out-of-process adapter that translates between WHP and the native CLI/RPC/HTTP protocol. WeWork Core communicates only with WHP and never imports Harness-specific SDK code.

The contract sits below Capability Governance. Passing the process protocol is necessary but insufficient for `executionReady`: the adapter must also prove ambient capability containment, authentication ownership, model ownership, resumable session isolation, cancellation acknowledgement and Broker-only external capability access.

## Adapter descriptor

```ts
type HarnessAdapterDescriptor = {
  protocolVersion: 1;
  id: string;
  harness: HarnessId | string;
  displayName: string;
  adapterVersion: string;
  source: 'builtin' | 'installed';
  executable: {
    commands: string[];
    versionArgs: string[];
    authProbe?: AdapterRequest;
  };
  transports: Array<'stdio-jsonrpc' | 'jsonl-process' | 'http'>;
  features: {
    streaming: boolean;
    resumeSession: boolean;
    cancellation: boolean;
    steering: boolean;
    modelCatalog: 'native' | 'default-only' | 'none';
  };
  containment: {
    disablesAmbientSkills: boolean;
    disablesAmbientExtensions: boolean;
    disablesAmbientMcp: boolean;
    disablesAmbientContext: boolean;
    brokerOnlyTools: boolean;
  };
  capabilityManifest: HarnessCapability[];
  integrity: { contentHash: string; signer?: string };
};
```

An installed descriptor is data, never executable JavaScript loaded into the Host. It points to a separately spawned adapter process and is validated against a strict schema, approved roots, content hash and device review state.

## Protocol layers

WHP has three distinct layers:

1. **Control plane:** discovery, version/auth probe, model catalog, capability metadata, run start/resume/steer/cancel and terminal acknowledgement.
2. **Event plane:** ordered text/activity/tool/usage/compaction/terminal notifications with run ID and monotonically increasing sequence.
3. **Capability plane:** calls to WeWork's Capability Broker. MCP is the first supported wire format for tool calls, but MCP servers never become the run authority.

MCP alone is not the Harness protocol: it has no standard ownership model for native login, model selection, session provenance, resume, cancellation acknowledgement, compaction or terminal durability.

## Adapter process protocol

The default WHP transport is stdio JSON-RPC 2.0, one UTF-8 JSON object per line. Remote SDH may use the same method and event envelopes over authenticated WebSocket/HTTP streaming. The Host starts a local adapter executable with `shell:false` and a scrubbed environment. Required methods:

- `adapter/initialize`: negotiate protocol version and return the exact descriptor/hash.
- `harness/probe`: return installation, native auth status, Harness version and containment evidence.
- `models/list`: return safe model identifiers/default only; never endpoints or credentials.
- `capabilities/list`: return metadata only; every new item is `unreviewed` in WeWork.
- `run/start`: consume projected task input and a Broker endpoint; return a native session ID.
- `run/resume`: resume only the supplied native session under the same Harness/employee/profile provenance.
- `run/cancel`: acknowledge only after the native executor and admitted calls have stopped.
- `run/steer`: optional and advertised by feature negotiation.
- Notifications: `run/textDelta`, `run/activity`, `run/usage`, `run/completed`, `run/failed`.

Every request carries `protocolVersion`, `requestId` and the relevant `runId`. Every event carries `runId`, `sequence` and `timestamp`. Unknown optional fields are ignored only within a negotiated minor version; unsupported major versions fail initialization. `run/completed` is valid only after all earlier events and admitted Broker calls are settled.

The adapter never receives the Vault itself. Native transcripts and compaction stay inside the Harness; WeWork stores only the native session reference and bounded portable output.

## Registry and readiness

The Adapter Registry owns descriptors, driver process health and review state. Harness discovery asks the Registry; execution dispatch asks the same Registry. This removes the current split where detection can find a CLI but dispatch still rejects it.

Readiness is the conjunction:

```text
installed
∧ adapter protocol verified
∧ adapter descriptor approved
∧ native authentication ready
∧ containment requirements satisfied
∧ required capability versions approved
∧ Broker transport healthy
```

The device Harness allowlist remains a separate operator choice after readiness. Enabling a Harness only permits execution with its compiled grant; it does not enable discovered capabilities.

## Built-in adapters

| Harness | Native driver | Required containment |
| --- | --- | --- |
| Pi | RPC mode | `--no-extensions --no-skills --no-prompt-templates --no-context-files`; explicit WeWork bridge only |
| SDH | remote HTTP/session protocol | send only compiled persona, reviewed business Skills and Broker tools |
| Claude Code | `--print --output-format stream-json --resume` | strict settings/MCP overlay; disable ambient plugins, Skills, hooks and project context; explicit Broker MCP only |
| Codex CLI | `codex exec --json`, `exec resume` | run-scoped config overlay; disable ambient MCP/plugins/rules/context; explicit Broker MCP only |
| Gemini CLI | documented headless JSON stream/resume mechanism | disable ambient extensions/MCP/context; explicit Broker MCP only |

If a native CLI version cannot prove one of these properties, that version remains installed but not `executionReady`.

## Future adapter onboarding

1. Install adapter package into the device adapter root.
2. Validate manifest schema, files, paths and hash; catalog as `unreviewed`.
3. Start in probe-only sandbox with no team data, Vault access or network beyond the native auth probe declared by policy.
4. Review descriptor, containment evidence and discovered capabilities.
5. Approve an exact adapter version/hash at device level.
6. Apply team, employee and task grants through the normal policy compiler.
7. Start through the standard protocol.

Updating an adapter or its Harness version creates a new review subject. Approval never floats across an unreviewed content hash.

## Migration order

1. Introduce Registry and protocol types; register existing Pi and SDH implementations behind compatibility drivers.
2. Move executable discovery, auth/model probe and dispatch behind Registry so one readiness result is authoritative.
3. Add the shared Broker MCP transport.
4. Ship Claude Code, Codex CLI and Gemini CLI built-in adapter processes.
5. Remove adapter-name conditionals from Host, RuntimeManager and settings UI.
6. Open the installed-adapter package path only after signature/hash review, strict-mode and hostile-adapter tests pass.

## Acceptance tests

- A fake conforming adapter becomes discoverable and executable without modifying Host dispatch code.
- A descriptor with an unknown field, path escape, changed hash or unsupported protocol is rejected before spawn.
- A malicious adapter cannot obtain team state, credentials, ungranted capability calls or network merely by claiming features.
- Detector and dispatcher cannot disagree about readiness.
- Updating/revoking an adapter prevents new runs; emergency capability revocation stops subsequent Broker calls in active runs.
- All five built-in Harnesses pass the same contract suite plus their native-protocol fixtures.
