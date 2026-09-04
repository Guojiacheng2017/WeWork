# WeWork Pi Collaboration Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an installed local Pi executable a usable WeWork employee Harness and verify that collaboration tools, tagged context, business Skills, optional project modules, and durable run recovery work through the real Host path.

**Architecture:** The Desktop Host remains the only process allowed to discover and launch local executables. Pi owns authentication, model discovery, native sessions, and compaction; WeWork injects layered WEWORK.md prompts, explicitly assigned business Skills, and a token-protected loopback tool bridge. Existing collaboration and project APIs remain canonical state owners.

**Tech Stack:** Node.js 22, Pi RPC 0.84.3, Electron IPC/loopback Host, React/TypeScript, Node test runner, Vitest.

## Global Constraints

- Do not adapt Claude Code, Codex CLI, or Gemini CLI in this change.
- Do not store or forward Pi credentials; Pi uses its own local authentication.
- SDH atomic Skills remain SDH-owned; WeWork only assigns WeWork/workspace business Skills.
- Project management stays optional and only exposes tools for enabled capabilities.
- Preserve unrelated uncommitted Runtime storage and smalldashharness changes.

---

### Task 1: Authorize a verified local Pi installation

**Files:**
- Modify: `app-runtime/src/host/harness-detector.js`
- Modify: `app-runtime/src/host/harness-policy.js`
- Test: `app-runtime/test/harness-detector.test.js`
- Test: `app-runtime/test/harness-policy.test.js`

**Interfaces:**
- Produces: Pi `HarnessInstallation` with `executionReady=true`, `weworkToolsReady=true`, and the existing Pi capability set after successful `--version` probing.
- Produces: persisted `allowedHarnesses` accepting only `pi` and `smalldashharness`.

- [ ] Write tests proving an installed Pi is executable and other detected CLIs remain inventory-only.
- [ ] Write tests proving policy accepts Pi but filters unsupported CLI IDs.
- [ ] Implement the minimal detector and policy changes.
- [ ] Run `npm --workspace wework-app-runtime test`.
- [ ] Commit only Task 1 files.

### Task 2: Expose Pi-owned model choices

**Files:**
- Modify: `app-runtime/src/host-main.js`
- Test: `app-runtime/test/pi-model-discovery.test.js`
- Test: `app-runtime/test/host-main-services.test.js` or the nearest Host route test.

**Interfaces:**
- Consumes: `discoverPiModels(executablePath)` from `app-runtime/src/host/pi-model-discovery.js`.
- Produces: `listHarnessModels(): {models, defaults}` merging Pi-discovered models with SDH service models without writing Pi connection data.

- [ ] Add a failing merge test covering Pi present, Pi absent, and Pi discovery failure.
- [ ] Resolve Pi from the verified detector result and merge its model catalog.
- [ ] Keep save/probe/default mutation SDH-only because Pi owns those settings.
- [ ] Run the focused Host and model-discovery tests.
- [ ] Commit only Task 2 files.

### Task 3: Verify collaboration exposure boundaries through Pi

**Files:**
- Modify: `app-runtime/test/pi-runtime.test.js`
- Modify: `app-runtime/test/wework-tools.test.js`
- Modify only if tests expose a gap: `app-runtime/src/pi-runtime.js`, `app-runtime/src/wework-tools.js`, `app-runtime/src/host/wework-service.js`

**Interfaces:**
- Validates: group tags select public messages before prompt construction.
- Validates: assigned WeWork Skills and WEWORK.md layers enter Pi system instructions; unassigned and SDH atomic Skills do not.
- Validates: Issues/Board/Gantt tools are registered only for enabled capabilities.

- [ ] Add an end-to-end prepared-run test for tagged group context.
- [ ] Add a Pi launch test for layered prompt and assigned business Skill content.
- [ ] Add a capability test proving disabled project tools cannot be called by a stale run.
- [ ] Implement only gaps exposed by those tests.
- [ ] Run Runtime tests and commit Task 3 files.

### Task 4: Verify durable recovery and diagnostics

**Files:**
- Modify: `app-runtime/test/runtime-manager.test.js`
- Modify: `desktop/test/diagnostic-log.test.js`
- Modify only if tests expose a gap: `app-runtime/src/host/runtime-manager.js`, `desktop/src/main.mjs`, `desktop/src/diagnostic-log.js`

**Interfaces:**
- Validates: checkpoints preserve Pi native session IDs and bounded history.
- Validates: a restarted Host reports terminal state and replays journal events without duplicate execution.
- Validates: diagnostic entries identify Host/bridge/session/Harness failures while redacting secrets.

- [ ] Add restart/replay and diagnostic redaction tests for a Pi run.
- [ ] Implement only missing persistence or diagnostic behavior.
- [ ] Run Runtime and Desktop tests.
- [ ] Commit Task 4 files.

### Task 5: Real local Pi smoke test and full regression

**Files:**
- Create: `app-runtime/scripts/smoke-pi.mjs`
- Modify: `app-runtime/package.json`
- Modify: `README.md` with the exact local smoke command and prerequisites.

**Interfaces:**
- Produces: `npm --workspace wework-app-runtime run smoke:pi`, which discovers the local Pi binary/models, launches one isolated temporary WeWork team/employee/session, exercises a read-only WeWork tool, and prints a redacted pass/fail summary.

- [ ] Implement the smoke runner with a temporary workspace and no persisted production mutation.
- [ ] Run the smoke test against `/Users/jcus/.nvm/versions/node/v22.22.0/bin/pi`.
- [ ] Run `npm test` and `npm run build`.
- [ ] Commit smoke/docs changes and report any external model/auth failure separately from adapter correctness.
