# WeWork Desktop Host and Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the local-first endpoint bridge that connects the WeWork TypeScript domain to real directory, credential, SSH, Pi runtime, cancellation, event replay, and durable checkpoint capabilities.

**Architecture:** `wework` remains the product UI and local team service. `wework-app-runtime` becomes a token-protected loopback Node sidecar that owns native macOS integration, secrets, SSH probes, and Pi runs. `wework-server` remains an optional collaboration provider and never receives secrets or executes harnesses.

**Tech Stack:** React/Vite/TypeScript, Node.js 22 built-in HTTP/SSE/process APIs, macOS `security` and `osascript`, OpenSSH, Pi Agent Core, Vitest and Node test runner.

## Global Constraints

- Preserve all shared-main uncommitted changes; do not reset or overwrite UI work.
- Do not modify `workspace-server` or make `wework-server` required.
- Secrets never enter team state, browser localStorage, logs, or WeWork Server requests.
- Runtime selection remains explicit: work override, employee default, team default.
- A Run is cancellable and harness/model switches only at Run boundaries.

---

### Task 1: Loopback bridge and stable errors

**Files:**
- Create: `wework-app-runtime/src/host/errors.js`
- Create: `wework-app-runtime/src/host/server.js`
- Create: `wework-app-runtime/test/host-server.test.js`
- Modify: `wework/src/runtime/weworkHost.ts`
- Test: `wework/src/runtime/weworkHost.test.ts`

**Interfaces:**
- Produces `GET /v1/health`, authenticated JSON requests, SSE event replay, and `WeWorkHostErrorCode`.
- Produces browser `LoopbackWeWorkHost` implementing the existing `WeWorkHost` surface.

- [ ] Write tests for missing token, unavailable host, typed error response, and event replay from `Last-Event-ID`.
- [ ] Run Node/Vitest tests and confirm missing implementation failures.
- [ ] Implement the minimal loopback server and client bridge.
- [ ] Run tests and confirm pass.

### Task 2: Native directory, Keychain, and SSH ports

**Files:**
- Create: `wework-app-runtime/src/host/directory.js`
- Create: `wework-app-runtime/src/host/keychain.js`
- Create: `wework-app-runtime/src/host/ssh.js`
- Create: `wework-app-runtime/test/native-ports.test.js`
- Modify: `wework-app-runtime/src/host/server.js`

**Interfaces:**
- Produces `currentDirectory()`, `chooseDirectory()`, `createCredential()`, `listCredentials()`, `resolveCredential()`, and `probeSshWorkspace()`.
- Credential list returns metadata only; resolve is internal-only.

- [ ] Write process-injected tests that assert exact `osascript`, `security`, and `ssh` invocation and verify no secret appears in responses.
- [ ] Run tests and confirm failures.
- [ ] Implement macOS adapters with argument arrays and redacted errors.
- [ ] Run tests and confirm pass.

### Task 3: Runtime lifecycle, cancellation, checkpoints, and replay

**Files:**
- Create: `wework-app-runtime/src/host/runtime-manager.js`
- Create: `wework-app-runtime/src/host/checkpoint-store.js`
- Create: `wework-app-runtime/test/runtime-manager.test.js`
- Modify: `wework-app-runtime/src/runtime.js`
- Modify: `wework-app-runtime/src/host/server.js`

**Interfaces:**
- Produces `POST /v1/runs`, `POST /v1/runs/:id/cancel`, `GET /v1/runs/:id`, and `GET /v1/events`.
- Emits monotonic events: queued, started, delta, succeeded/failed/cancelled.
- Persists atomic JSON checkpoints and terminal run state beneath an endpoint data directory.

- [ ] Write tests for success, cancellation via AbortSignal, restart recovery, event replay, missing runtime profile, and missing credential.
- [ ] Run tests and confirm failures.
- [ ] Implement RuntimeManager and atomic checkpoint store; pass AbortSignal into Pi execution.
- [ ] Run tests and confirm pass.

### Task 4: Scheduler-to-sidecar integration and local persistence

**Files:**
- Create: `wework/src/runtime/localRunScheduler.ts`
- Create: `wework/src/runtime/localRunScheduler.test.ts`
- Modify: `wework/src/local/localWeWorkApi.ts`
- Modify: `wework/src/domain/wework.ts`

**Interfaces:**
- Produces one `startCurrentWork(employeeId)` path that resolves Work, Runtime Profile, Workspace, checkpoint, and invokes the Host.
- Produces `cancelCurrentWork(employeeId)` and durable run/event/checkpoint state.

- [ ] Write tests for profile precedence, one active Run per employee, cancel, terminal task promotion, and reload recovery.
- [ ] Run tests and confirm failures.
- [ ] Implement the scheduler and local service persistence methods.
- [ ] Run tests and confirm pass.

### Task 5: End-to-end and deployment contract

**Files:**
- Create: `wework-app-runtime/test/e2e-local-run.test.js`
- Modify: `wework-app-runtime/README.md`
- Modify: `wework/docs/product/2026-08-27-wework-app-service-architecture.md`
- Modify: `wework/package.json`

**Interfaces:**
- Produces documented start commands, token bootstrap, state ownership table, and bridge API schema.

- [ ] Write an E2E test using a fake model stream: create config, resolve workspace, start, stream, cancel/complete, restart, and replay.
- [ ] Run E2E and confirm failure before wiring.
- [ ] Implement start scripts and documentation.
- [ ] Run complete Node tests, Vitest, TypeScript/Vite build, and fresh WeWork Server migration as optional-provider regression.
