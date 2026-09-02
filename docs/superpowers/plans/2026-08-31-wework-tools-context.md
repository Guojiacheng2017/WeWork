# WeWork Tools and Work Context Implementation Plan

> **For agentic workers:** Execute this plan task-by-task in the current authorized workspace. Preserve existing README and package changes; do not commit or publish.

**Goal:** Connect persistent team management, task context, progress and reviewed deliverables to the bundled Pi runtime through run-scoped WeWork tools.

**Architecture:** Reuse the local WeWork business API in the desktop Host and browser fallback. Host owns an atomic JSON store and binds tool identity from stored employee/work records. Existing remote mode remains unchanged; external Harness tool protocols are outside this increment.

**Tech Stack:** TypeScript, Node.js, Electron IPC, Pi Agent, Vitest and node:test. No new dependencies.

## Global Constraints

- Preserve web entry and existing remote API behavior.
- No model or SSH secrets in renderer/team records; credentials remain in the vault.
- No agent self-approval, cross-team writes or model-controlled employee identity.
- Runtime success must not automatically complete a locally managed task.
- First version uses one shared WeWork session per team, stable ID, and per-work employee execution sessions; multi-session UI and automatic group dispatch are follow-ups.
- JSON persistence is single-Host and atomic; no claim of multi-process database concurrency.

### Task 1: Shared business records and context

Files: `src/domain/wework.ts`, `src/local/workContext.ts`, `src/local/localWeWorkApi.ts`, `src/local/workContext.test.ts`.

- [x] Add input references, acceptance criteria, immutable document revisions, append-only progress and deliverable revisions with explicit human review.
- [x] Add work-context API with bounded document excerpts, exact references and missing-context metadata; allow paged full-document reads.
- [x] Add progress, document, submit/review and audit APIs to the same local storage transaction boundary.
- [x] Test revisions, stale review rejection, source isolation, persistence, completion gate and context limits with MemoryWeWorkStorage.

Interfaces: `getWorkContext(workId)`, `saveWorkDocument(workId,input)`, `readWorkDocument(workId,id,offset)`, `reportProgress(workId,input,actor?)`, `submitDeliverable(workId,input,actor?)`, `reviewDeliverable(workId,input)`; all return JSON-safe records.

### Task 2: Host authority and WeWork tools

Files: `app-runtime/src/host/wework-service.js`, `app-runtime/src/wework-tools.js`, `app-runtime/src/host-main.js`, `app-runtime/src/host/server.js`, `app-runtime/src/runtime.js`, `app-runtime/src/host/runtime-manager.js`, related node tests.

- [x] Add atomic file-backed WeWorkStorage and allowlisted UI dispatch.
- [x] Resolve employee/work/profile from Host storage and provide context manifest in prompt, never trusting renderer persona or model tool identity.
- [x] Register Pi tools for team/task reads, progress, documents, deliverables, group messages and handoff requests; expose no review tool.
- [x] Persist run outcomes without accepting deliverables; isolate checkpoints by execution session and reject duplicate active employee runs.
- [x] Test with a fake Agent actually invoking tools and a real temporary store; verify restart, denied calls and no automatic completion.

### Task 3: Desktop bridge and compatibility

Files: `src/api/hostWeWorkApi.ts`, `src/api/weworkApi.ts`, `src/runtime/weworkHost.ts`, `desktop/src/preload.cjs`, `desktop/src/main.mjs`, `src/state/weworkStore.ts`.

- [x] Add allowlisted WeWork API IPC bridge and one-time non-destructive import of legacy browser teams/profiles into empty Host store.
- [x] Use Host API for desktop-local mode, retain browser-local and remote modes.
- [x] Stop local success callbacks from auto-completing work; retain manual acceptance path with deliverable gate.
- [x] Test migration/reload and compile/build both UI and packaged runtime.

### Task 4: Verification and operational documentation

- [x] Run `npm test`, `npm run build:web`, `npm --workspace wework-desktop run bundle:runtime`.
- [x] Document tool contracts, actor boundary, JSON store limitations, context policy and unsupported integrations in `docs/wework-harness.md`.
- [x] Inspect final diff for unrelated changes and secret propagation; report actual verification without claiming a live provider run.

## Verification result

Completed in the existing authorized workspace without commits. Web: 27 tests; runtime: 26 tests; desktop: 4 tests. UI TypeScript/Vite build and bundled runtime build passed (existing-size chunk warnings remain). Bundled Host authenticated RPC and restart persistence smoke test passed with temporary storage. Live provider execution and interactive GUI verification were not performed.
