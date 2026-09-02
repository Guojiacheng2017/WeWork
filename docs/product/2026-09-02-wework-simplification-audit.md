# WeWork Simplification Audit

Status: proposed

## Scope and method

This audit applies the evidence rules from `dsh-find-simplifications` to the current WeWork renderer, local store, Desktop Host, App Runtime, optional Server, tests, build scripts, and product architecture. A candidate is retained only when production and non-production consumers can be named. Tests and current implementation are evidence, not automatic reasons to preserve a surface. Security boundaries, settled cancellation semantics, Team ownership, employee Session isolation, Harness adapters, and the optional collaboration Server are treated as intentional architecture.

## 1. Delete the non-functional Workspace transfer facade

### Problem

`src/domain/wework.ts` declares `ArtifactRef`, `WorkspaceManifest`, the Workspace upload/download/sync request types, and `WorkspaceSyncResult`. `src/local/localWeWorkApi.ts` exposes `uploadWorkspaceArtifact`, `downloadWorkspaceArtifact`, and `syncWorkspace`, but every method only throws `WORKSPACE_HOST_REQUIRED` or `WORKSPACE_SYNC_UNAVAILABLE`. There is no renderer caller, Host endpoint, Runtime implementation, Desktop bridge, or Server implementation. The only executable consumers are throw-only assertions in `src/local/localWeWorkApi.test.ts`.

### Proposal

Delete the unused types, three throwing methods, imports, and tests. Define a real Host transport contract when explicit repository/artifact transfer is implemented.

### Tradeoff and acceptance

This removes a compile-time placeholder but no working behavior. Exact symbol and error-code searches should return no production references; web and Runtime tests must remain green.

## 2. Make Team work items one canonical collection

### Problem

One Work item can currently live in five locations: `WeWorkTeam.pendingWorks`, `WeWorkTeam.cancelledWorks`, and each employee's `currentWorkItem`, `queuedWorkItems`, or `completedWorkItems` in `src/domain/wework.ts`. Location duplicates `status`, `assignedEmployeeId`, and cancellation metadata. `src/local/localWeWorkApi.ts` scans and moves across all five locations; `src/local/collaborationState.ts` independently repeats transfer/promotion behavior. `TeamManagementView`, `collaborationHarness`, `PendingWorkBar`, `EmployeeWorkbench`, and `localRunScheduler` reconstruct lifecycle views from the same distributed representation.

### Proposal

Store `WeWorkTeam.works: WorkItem[]` as the single fact source. Keep lifecycle, assignee, and explicit queue order on the record. Central selectors derive pending/current/queued/completed/cancelled views; mutations update one record transactionally. Remove the five-branch lookup, array transfers, flatten/deduplicate aggregators, and duplicate Handoff promotion logic.

### Tradeoff and acceptance

This requires snapshot and optional Server migration plus broad selector changes. Queue order must be explicit. No task, Issue, assignment, cancellation, handoff, or history capability may be removed. Add migration fixtures and prove each Work ID exists exactly once after every transition.

## 3. Remove fabricated context telemetry and the optimistic shadow message

### Problem

`ContextMetric`, `EmployeeSession.contextRatio`, and `EmployeeSession.metrics` have no Host or Harness producer. Values originate in `src/data/mockData.ts`; session creation/reset writes `0` and empty arrays; `weworkStore.sendWorkbenchMessage` adds an arbitrary five percentage points. The UI presents these values as real Context Load and runtime metrics. The same send action inserts a renderer-only message, persists the real message, then immediately hydrates and replaces the shadow copy.

### Proposal

Remove the fake metric types, fixtures, increment heuristic, and utilization charts until Runtime reports measured token/window data. Persist a user message first and hydrate authoritative state; retain `assistant.delta` because it has a real Runtime stream producer. Use message existence rather than fake context percentage for Session mutability decisions.

### Tradeoff and acceptance

The workbench temporarily loses decorative utilization charts but becomes truthful. Persona, context tags, selective Session exposure, reset/new Session, and streaming must remain. A sent message must appear once after success and must not survive a failed persistence call.

## 4. Centralize assignable Harness catalog selection

### Problem

`AddEmployeeModal`, `TeamManagementView`, and `ExecutionSettingsDialog` each call `weworkHost.harnesses()`, `harnessPolicy()`, and `harnessModels()`, then separately filter readiness, allowance, verified models, and defaults. Harness-to-runtime/adapter mappings are split across these components and `workspaceDraft.ts`. The eligibility/default logic itself has no single shared test and can diverge between employee creation, employee editing, and Settings.

### Proposal

Create one catalog loader/selector returning installations, assignable Harnesses, verified models, and effective defaults, with canonical Harness-to-runtime/adapter mapping. Keep Settings mutations separate, but invalidate or refresh the same snapshot after a policy/model change.

### Tradeoff and acceptance

Do not introduce an unowned global cache. Define refresh ownership so already-open employee dialogs cannot retain stale policy. Creation and editing must expose the same choices for the same Host snapshot.

## 5. Make RuntimeManager the sole active-run lifecycle owner

### Problem

`RuntimeManager` owns the active Run map and its start/cancel/settlement transitions, but `host-main.js`, `wework-service.js`, and `collaboration-coordinator.js` directly inspect its mutable `active` map in four different ways. This spreads liveness interpretation across shutdown, task cancellation, and collaboration admission while the underlying ownership already belongs to `runtime-manager.js`.

### Proposal

Keep the map private and expose narrow lifecycle queries/operations such as active-by-Run, active-by-employee, and cancel-all-and-wait. Move iteration and settlement interpretation into RuntimeManager; callers request outcomes rather than inspecting storage.

### Tradeoff and acceptance

Preserve admission fences, synchronous publication, cancellation settlement, first-terminal-outcome arbitration, and employee ownership. Existing concurrency/integration tests should be rewritten against behavior, not map structure.

## 6. Share the atomic JSON-file primitive, not the domain validators

### Problem

`harness-policy.js`, `directory.js`, `checkpoint-store.js`, `harness-model-catalog.js`, and Keychain metadata repeat directory creation, missing-file handling, JSON parsing, temporary files, modes, and rename operations. Temporary naming and atomicity differ; Keychain metadata still writes in place. The catalog serialization queue, Team generation/index transaction, validation, and secret ownership are separate concerns and should remain so.

### Proposal

Extract small internal `readJsonIfExists` and atomic `writeJson` primitives with explicit file mode and optional quarantine hooks. Keep model/catalog validation, Vault resolution, the catalog write queue, and fsync-heavy Team snapshot promotion in their current owners.

### Tradeoff and acceptance

Reject a generic persistence framework that merely relocates complexity. The change should delete repeated mechanics, preserve `0600` where required, and pass crash/corruption/concurrency tests for each owner.

## 7. Fold duplicated task/group execution preparation

### Problem

`wework-service.js` separately prepares normal task Runs and group-delivery Runs. Both resolve employee/profile fallback, validate the enabled profile, resolve layered workspace/configuration, compute effective runtime settings, project employee identity/Skills, and create WeWork Session metadata. Admission, Work override, context, Session ID, and delivery reservation legitimately differ.

### Proposal

Extract only the invariant employee execution-context builder. Leave normal Work admission, group delivery reservation, context selection, Session IDs, and external-run validation explicit at their trust boundaries.

### Tradeoff and acceptance

The helper must not erase the task-level profile override or make group Runs inherit one. Existing task, group, cancellation, and external-run integration tests must exercise the shared builder through production entry points.

## 8. Decide whether the Server Runtime-worker protocol has an owner

### Problem

The optional Server defines Runtime Run/session persistence and `/v1/runtime-runs`, claim, complete, and callback endpoints in `server/app/main.py`, schemas, models, migrations, and tests. No current renderer, remote API client, Desktop Host, or App Runtime production path calls them; local execution uses Host `RuntimeManager` and local checkpoints. Current consumers are Server tests and stale responsibility prose in `app-runtime/README.md`.

### Proposal

If no remote Runner is scheduled for the next delivery boundary, remove this worker queue/session protocol while retaining the optional collaboration Server and Work assignment. Reintroduce it with a real remote Runner contract rather than maintaining an unowned second execution lifecycle. If a remote Runner is imminent, instead name that consumer and add an end-to-end owner test; in that case this candidate is rejected.

### Tradeoff and acceptance

Removal gives up compatibility with hypothetical workers and needs a pre-release database migration/reset decision. Exact endpoint/class searches must leave no advertised capability. The Server's team, Work, group chat, artifact, and remote-mode APIs remain.

## 9. Replace mutable Alembic history with a static pre-release baseline

### Problem

`server/migrations/versions/0001_wework_core.py` imports current ORM models and runs `Base.metadata.create_all`, so historical meaning changes with current code. Later migrations repeatedly inspect and conditionally add columns, keys, and indexes that a fresh baseline already creates. This duplicates schema construction and makes replay evidence misleading.

### Proposal

Only if no deployed database compatibility obligation exists, replace the current chain with one explicit static baseline matching the current schema. Future migrations must never import mutable current models.

### Tradeoff and acceptance

Existing development revision stamps need a documented reset or one-time stamp. Validate fresh SQLite and PostgreSQL upgrade/downgrade and compare the resulting schema with ORM metadata. Reject this proposal if any released database must upgrade in place.

## 10. Give TS/Python validation one shared conformance owner

### Problem

`src/domain/wework.ts` and `server/app/schemas.py` independently encode model/provider limits, JavaScript trim and UTF-16 length semantics, URL rules, credential-reference syntax, environment allowlists, adapters, Session provenance, and Workspace assignments. Workspace already has a language-neutral vector file, but model/profile tests are hand-copied. The adapter matrices have drifted: TypeScript recognizes five Harness adapters while the Python Runtime Profile create schema admits fewer.

### Proposal

Create checked-in language-neutral conformance vectors for model, Runtime Profile, Session execution, and Workspace contracts, consumed by Vitest and Pytest. Keep thin native validators at each untrusted boundary. Do not introduce schema generation unless it produces net deletion after custom URL/UTF-16 semantics are counted.

### Tradeoff and acceptance

This simplifies ownership more than raw LOC initially. Every vector must yield the same accept/reject and normalized fields in both languages; persistence-only Server validation may remain narrower only when documented as such.

## Local cleanups, not durable proposals

- Remove the ignored `server/pi-runtime` remnant; it contains only an unused dependency tree and is not referenced by source, docs, or build paths.
- Remove unused Claude/Codex/Gemini entries from the Runtime detector's static capability object if they still have no reader.
- Make the Desktop development command bundle Runtime exactly once; the top-level development script and Electron startup currently overlap on a non-primary path.
- Remove the deprecated `WeWorkDataInfo.workspaceManifest` UI fallback after the minimum supported Host version no longer returns it.

## Rejected candidates

- Do not collapse `RuntimeProfile` and `SessionExecution`: profile provenance and immutable per-Session snapshots are intentional.
- Do not delete the WeWork collaboration Harness because it lacks complete wiring; it is an explicit product requirement, so wiring is missing work rather than redundant surface.
- Do not delete `prepareExternal` or the external Run entry: the local scheduler has a production path and it is a distinct trust boundary.
- Do not simplify CollaborationCoordinator's transition, start, timer, and cancellation states without an ownership proof; current tests map them to distinct admission and settlement races.
- Do not merge Desktop preload/API routing through an unreviewed dynamic table; the repeated allow-list is part of the renderer/bearer security boundary.
- Do not delete the optional WeWork Server, S3/MinIO artifact target, Workspace conformance fixture, generated Runtime bundle, or packaged `dist` inputs; each has a production or packaging owner.
- Do not delete either local/remote persistence mode merely because local-first is the default.

## Suggested sequence

Start with proposals 1, 3, and 4 because they remove false capability, false telemetry, and duplicated selection logic without a data migration. Then perform 5–7 as internal Runtime refactors with concurrency tests. Treat 2, 8, 9, and 10 as explicit migration/architecture decisions rather than incidental cleanup.
