# Claude Code and Codex CLI Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the installed Claude Code and Codex CLI usable as verified WeWork employee Harnesses while preserving each CLI's login, model configuration, native session and compaction behavior.

**Architecture:** Add two independent process adapters behind the existing `executeHarness` contract. Both adapters use a bundled, run-scoped stdio MCP server to expose the existing closure-bound WeWork tools, but each owns its CLI arguments, JSON event parser, native session identifier and cancellation rules. WeWork stores only adapter/model references and normalized portable output; it never reads, copies or injects provider credentials, endpoint URLs, native transcripts or compaction state.

**Tech Stack:** Node.js 22 ESM, child processes with `shell:false`, JSONL/stream-json, Model Context Protocol over stdio, existing RuntimeManager/CheckpointStore, Node test runner, Electron/esbuild packaging.

## Global Constraints

- Target the locally verified command families: Claude Code `2.1.267` and Codex CLI `0.153.4`; feature-detect protocol behavior instead of comparing version strings.
- Claude Code and Codex CLI must inherit their own login state, user configuration, model defaults and model access. Never accept an Office Base URL or credential for either adapter.
- An employee Session may follow the Harness default or request a model exposed/accepted by that Harness. A model override is passed only as the native CLI `--model` argument.
- A native checkpoint may resume only when employee ID, adapter, execution profile ID and Office Session checkpoint key all match.
- Same-Harness model changes retain the native session and native compaction. Cross-Harness checkpoint reuse remains forbidden by `SESSION_HARNESS_IMMUTABLE`.
- Never use `--dangerously-skip-permissions`, `--dangerously-bypass-approvals-and-sandbox`, or a shell command string. Start exact executable paths with argv arrays and `shell:false`.
- The MCP bridge is run-scoped, authenticated by an unguessable token, closure-bound to employee/run identity, and terminated before the employee ownership fence is released.
- Installation alone is not readiness. Mark an adapter `executionReady` only after its auth/config probe, machine-readable event protocol and MCP tool round-trip are verified.
- Preserve unrelated uncommitted work in the shared checkout; stage only files listed by each task.

---

## File map

- Create `app-runtime/src/wework-tool-bridge.js`: shared authenticated loopback endpoint and tool definition serialization currently embedded in the Pi adapter.
- Create `app-runtime/src/wework-mcp-server.mjs`: stdio MCP server that forwards only declared WeWork tools to the run bridge.
- Modify `app-runtime/src/pi-runtime.js`: consume the extracted bridge without changing Pi behavior.
- Create `app-runtime/src/claude-code-runtime.js`: Claude process lifecycle, stream-json parser and native resume.
- Create `app-runtime/src/codex-cli-runtime.js`: Codex exec lifecycle, JSONL parser and native resume.
- Create `app-runtime/src/claude-code-model-discovery.js`: auth/default-model capability probe without credential reads.
- Create `app-runtime/src/codex-cli-model-discovery.js`: app-server model listing with config-only fallback.
- Modify `app-runtime/src/harness-dispatch.js`: register the two verified adapters.
- Modify `app-runtime/src/host/harness-detector.js`: protocol-specific readiness and diagnostics.
- Modify `app-runtime/src/host/available-harness-models.js`: merge native catalogs/defaults.
- Modify `app-runtime/src/host-main.js`: inject executable and MCP-server paths.
- Modify `app-runtime/src/host/runtime-manager.js`: advertise steering only for adapters that implement it; no adapter-name special case.
- Modify `desktop/src/build-runtime.mjs`: package the stdio MCP server and the existing Windows command wrapper on every desktop build.
- Add focused tests under `app-runtime/test/` for every new boundary.

### Task 1: Shared run-scoped WeWork MCP bridge

**Files:**
- Create: `app-runtime/src/wework-tool-bridge.js`
- Create: `app-runtime/src/wework-mcp-server.mjs`
- Create: `app-runtime/test/wework-mcp-server.test.js`
- Modify: `app-runtime/src/pi-runtime.js`
- Modify: `desktop/src/build-runtime.mjs`

**Interfaces:**
- Produce: `createWeWorkToolBridge(tools, signal): Promise<{url,token,definitions,close}>`.
- Produce: stdio MCP methods `initialize`, `tools/list`, and `tools/call`; tool calls POST `{name,callId,arguments}` to the bridge with `Authorization: Bearer <token>`.
- Consume: existing `{name,label,description,parameters,execute}` tool objects.

- [ ] Write a failing test that launches `wework-mcp-server.mjs`, performs MCP initialization/list/call over newline-delimited JSON-RPC, and verifies one closure-bound fake tool receives the exact call ID and arguments.
- [ ] Add rejection cases for missing token, undeclared tools, malformed arguments, bridge non-2xx responses, abort during a call and bridge shutdown with an admitted call in flight.
- [ ] Implement `wework-tool-bridge.js` by extracting the Pi loopback code; keep `127.0.0.1`, bearer authentication, bounded request bodies and idempotent async `close()`.
- [ ] Implement the stdio MCP server with no filesystem, shell or network tools of its own. Read bridge URL/token/definitions only from `WEWORK_TOOL_*` environment variables and never print them.
- [ ] Refactor Pi to use the shared bridge and rerun all Pi tests to prove no regression.
- [ ] Package the MCP server beside `host-main.cjs` and add a build assertion that the output file exists.
- [ ] Commit only these files with `feat(wework): add run scoped MCP tool bridge`.

### Task 2: Claude Code adapter

**Files:**
- Create: `app-runtime/src/claude-code-runtime.js`
- Create: `app-runtime/src/claude-stream-json.js`
- Create: `app-runtime/test/claude-code-runtime.test.js`
- Modify: `app-runtime/src/harness-dispatch.js`
- Modify: `app-runtime/src/host-main.js`

**Interfaces:**
- Produce: `executeClaudeCodeRun(spec, options): Promise<{nativeSessionId,messages,finalText,usage}>`.
- Consume: `options.{signal,emit,tools,executablePath,mcpServerPath,spawnProcess,bundledSkillRoots}`.

- [ ] Write a fake-child test asserting a new run invokes the exact executable with `-p`, `--output-format stream-json`, `--verbose`, `--append-system-prompt`, a generated `--mcp-config`, `--permission-mode dontAsk`, and `--permission-prompts none`.
- [ ] Assert the adapter omits `--model` for `modelId:'default'`, otherwise passes only `--model <native-id>`; it must never synthesize auth, provider URL or API-key environment variables.
- [ ] Define parser fixtures for Claude `system` initialization, assistant text deltas, tool start/end, final `result`, usage/cost metadata and error records. Reject truncated output or exit-zero-without-result.
- [ ] Capture the native `session_id` from the initialization/result stream. On continuation add `--resume <nativeSessionId>`; never use `--continue`, because it is cwd-global rather than Office-Session-specific.
- [ ] Generate a temporary MCP config containing only the bundled WeWork stdio server and run token. Remove it in `finally`; pass the generated WeWork MCP tool names through `--allowedTools` while leaving ordinary Claude Code permissions governed by its own settings and `dontAsk` denial behavior.
- [ ] Map text chunks to `assistant.delta`, thinking/status to `assistant.activity`, and completed `wework_*` calls to `wework.updated`. Return a bounded portable transcript derived from machine-readable output, not Claude's private project files.
- [ ] On abort send `SIGTERM`, wait for `close`, escalate to `SIGKILL` only after the bounded grace period, and do not resolve cancellation while an admitted bridge call is unfinished.
- [ ] Add dispatch wiring only after new, resume, MCP round-trip, model override, malformed stream, nonzero exit and cancellation tests pass.
- [ ] Commit with `feat(wework): add Claude Code harness adapter`.

### Task 3: Codex CLI adapter

**Files:**
- Create: `app-runtime/src/codex-cli-runtime.js`
- Create: `app-runtime/src/codex-json-lines.js`
- Create: `app-runtime/test/codex-cli-runtime.test.js`
- Modify: `app-runtime/src/harness-dispatch.js`
- Modify: `app-runtime/src/host-main.js`

**Interfaces:**
- Produce: `executeCodexCliRun(spec, options): Promise<{nativeSessionId,messages,finalText,usage}>`.
- Consume the same adapter options as Claude; preserve Codex's `$CODEX_HOME`, login and base config.

- [ ] Write a fake-child test asserting a new run uses `codex exec --json -C <workspace> --sandbox workspace-write --ask-for-approval never --thread-source wework <prompt>`.
- [ ] Assert continuation uses `codex exec resume <nativeSessionId> --json ...` with the exact saved ID. Do not use `--last`, interactive `resume`, `fork`, `--ephemeral` or `--ignore-user-config`.
- [ ] Add a run-scoped Codex config overlay for the WeWork MCP server using supported `-c mcp_servers.<name>...` keys while retaining the user's base config. The overlay may contain only MCP command/argv/env references and execution policy, never model-provider or auth values.
- [ ] Assert default model adds no `-m`; an employee override adds `-m <native-id>` only.
- [ ] Define JSONL fixtures for thread/session creation, item start/completion, assistant message deltas or completed text, MCP tool calls, token usage, terminal success and terminal error. Unknown events are ignored and recorded in diagnostics; invalid JSON and missing terminal success fail the run.
- [ ] Normalize assistant output/activity/update events and extract the native thread ID. Return only portable user/assistant records needed by RuntimeManager.
- [ ] Implement cancellation as signal, grace period and verified process close. Treat approval-required failures as stable `CODEX_APPROVAL_REQUIRED`, not success or an automatic bypass.
- [ ] Add dispatch wiring after new/resume/MCP/model/error/cancellation tests pass.
- [ ] Commit with `feat(wework): add Codex CLI harness adapter`.

### Task 4: Native login, default model and model catalog discovery

**Files:**
- Create: `app-runtime/src/claude-code-model-discovery.js`
- Create: `app-runtime/src/codex-cli-model-discovery.js`
- Create: `app-runtime/test/claude-code-model-discovery.test.js`
- Create: `app-runtime/test/codex-cli-model-discovery.test.js`
- Modify: `app-runtime/src/host/available-harness-models.js`
- Modify: `app-runtime/src/host/harness-detector.js`
- Modify: `app-runtime/test/harness-detector.test.js`

**Interfaces:**
- Produce per Harness: `{authenticated:boolean, defaultModel?:{provider,modelId}, models:HarnessModel[], catalogMode:'native'|'default-only', diagnostics?:string}`.

- [ ] For Claude, run `claude auth status --json` and parse only login/provider status. Read the effective default model through Claude's own configuration semantics already exposed by detector configuration; do not inspect credential/keychain files.
- [ ] Treat Claude's catalog as `default-only` unless the installed CLI exposes a documented machine-readable model-list capability. Include the native default/alias as a selectable verified reference, but do not invent a static Office list or make a paid prompt merely to probe a model.
- [ ] For Codex, start `codex app-server --stdio` (or proxy to its existing daemon), initialize the protocol and call its model-list method discovered from the generated schema. Mark the returned current model as default and strip provider endpoints, auth details and unrelated metadata.
- [ ] If Codex app-server model listing is unavailable, fall back to the effective `model`/`model_provider` identifiers from Codex configuration and report `catalogMode:'default-only'`; installation remains visible but catalog diagnostics explain the limitation.
- [ ] Merge native models into `available-harness-models.js` as `source:'harness-discovered'`; never persist them in `harness-models.json`. Preserve the existing rule that only SDH accepts Office-managed model connections/defaults.
- [ ] Add tests proving stdout containing credentials/base URLs is reduced to safe identifiers, auth failure does not erase installation evidence, timeouts kill probes, and stale external model records remain hidden.
- [ ] Commit with `feat(wework): discover Claude and Codex native models`.

### Task 5: Readiness, capability negotiation and UI behavior

**Files:**
- Modify: `app-runtime/src/host/harness-detector.js`
- Modify: `app-runtime/src/host/runtime-manager.js`
- Modify: `src/runtime/weworkHost.ts`
- Modify: `src/components/settings/HarnessModelCatalog.tsx`
- Modify: `src/components/settings/ExecutionSettingsDialog.tsx`
- Modify: `src/components/team/TeamManagementView.tsx`
- Test: `app-runtime/test/harness-detector.test.js`
- Test: `src/runtime/weworkHost.test.ts`

**Interfaces:**
- Extend capability data with `protocolReady`, `authenticated`, `catalogMode`, and `steering` while keeping existing booleans backward compatible.

- [ ] Replace Pi-only readiness with adapter-specific probes: executable/version + auth state + machine-readable protocol + packaged MCP bridge. A failed dimension supplies a stable code and user-facing diagnostic.
- [ ] Set Claude/Codex `executionReady` and `weworkToolsReady` only when their complete probe succeeds. Keep the allow-employee toggle disabled otherwise.
- [ ] Make RuntimeManager call `controls.steer` based on registered controls instead of checking `adapter === 'pi'`. For v1 Claude/Codex, publish `steering:false`; follow-ups queue after the current turn rather than entering an active process.
- [ ] Show external catalogs as read-only with badges for `Harness 默认`, `完整目录` or `仅检测到默认模型`. Never render URL/credential inputs for Claude or Codex.
- [ ] Keep the current Session Harness lock. Allow “跟随 Harness 默认” and any verified native model reference; show a clear error when a previously selected model disappears from the current native catalog.
- [ ] Add UI/domain tests for ready, logged-out, protocol-failed, default-only, removed-model and same-Harness-model-change states.
- [ ] Commit with `feat(wework): expose Claude and Codex adapter readiness`.

### Task 6: End-to-end verification and release gate

**Files:**
- Create: `app-runtime/test/claude-code-integration.test.js`
- Create: `app-runtime/test/codex-cli-integration.test.js`
- Modify: `docs/product/2026-09-01-harness-integration-verification.md`

**Interfaces:**
- Consume the packaged Host, local fixture CLIs and the real installed CLIs in explicit read-only smoke mode.

- [ ] Build fixture executables that emulate each CLI's exact JSON protocol and MCP client. Run a full assigned task through RuntimeManager: stream text, call `wework_get_task_context`, write a progress record, persist the native session ID, resume, then cancel a second turn.
- [ ] Verify tenant/team, employee, task and private/group context isolation; forged tool identity, stale assignment, unknown tool and late post-cancel writes must fail.
- [ ] Verify process environment snapshots contain the run bridge token but no Office model credential, provider URL, unrelated secret variables or copied Harness credentials.
- [ ] Run read-only real-CLI probes: `claude auth status --json`, `codex login status`, and Codex app-server initialization/model listing. Validate Claude stream-json itself with the fixture CLI rather than issuing a paid real-model prompt. Record version and capability results without printing account identifiers or tokens.
- [ ] Run `npm test` and `npm run build`; then launch the packaged app and confirm both cards show accurate availability/readiness, native model/default status and actionable diagnostics.
- [ ] Update the verification document with exact test totals, platforms, versions, any default-only catalog limitation and the fact that no permission bypass flag is used.
- [ ] Commit with `test(wework): verify Claude and Codex harness adapters`.

## Release acceptance

- Claude and Codex use their existing successful local logins; WeWork has no credential or endpoint fields for them.
- Both execute a task, stream normalized output, invoke closure-bound WeWork tools, persist a native session ID, resume the exact session and cancel only after confirmed process shutdown.
- Same-Harness model override works without breaking native continuation/compaction. Cross-Harness resume remains impossible.
- Logged-out, unavailable-model, malformed-stream, MCP failure, approval denial, cancellation timeout and crash paths produce stable non-success terminal states.
- Browser fallback claims neither adapter is executable. Packaged macOS passes; Windows remains unavailable unless its exact command wrapper and MCP child behavior pass the same suite.

## References used for protocol choices

- Anthropic Claude Code CLI reference: `--print`, `stream-json`, `--resume`, `--model`, `--mcp-config`, permission modes and native session persistence.
- OpenAI Codex CLI `0.153.4` local help: `exec --json`, `exec resume`, `--model`, `-C`, sandbox/approval flags, app-server stdio and MCP configuration.
- Existing project policy: `docs/wework-harness.md`, especially Harness-owned auth/model state and cross-Harness Session immutability.
