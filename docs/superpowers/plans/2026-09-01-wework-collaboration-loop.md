# WeWork Collaboration Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make WeWork own durable inter-employee messages, dispatch and approved handoffs while employee Harness adapters own actual execution, Skills and native context.

**Architecture:** Extend the existing Host-backed local WeWork API rather than the old in-memory CollaborationHarness. Persist a collaboration inbox and handoff records in the same WeWork transaction as their messages/tasks. A Host coordinator delivers inbox entries through the adapter-backed RuntimeManager; renderer refresh is not required for progress.

**Tech Stack:** TypeScript local business API, Node Host, Electron preload, React/Zustand, Vitest and node:test.

## Global Constraints

- Preserve the existing uncommitted WeWork Tools/work-context implementation; confirm ownership before committing it.
- Retain the browser entry and existing teams/round-table/DAG/management information architecture.
- Do not modify workspace-server or the independent flexible-organization rebuild branch.
- External Pi/Claude/Codex/Gemini must be discovered and protocol-validated on the target computer; never silently fall back to Pi.
- Bundled smalldashharness is an employee Harness, not WeWork Harness. Its context/Skills/packaging are owned by the adapters task.
- Skill instructions and scripts are not WeWork management authority. Model-facing tools cannot accept deliverables, forge identity or silently change task ownership.
- Workspace and native Session must be team/employee scoped; public group messages must not include private workbench history.
- Existing native sdh subtree rules prohibit writes. Source modification requires the user's explicit exception first.
- Confirm shared-workspace implementation permission before changing main; do not discard or overwrite anyone's work.
- Real model calls are separately reported; fake adapters validate orchestration but do not prove real providers work.

## Baseline and ownership

After the explicit user authorization and context-based ownership discussion, this task owns `src/local/**`, `src/domain/wework.ts`, `app-runtime/src/host/wework-service.js`, `wework-tools.js`, `collaboration-coordinator.js`, `host/server.js`, and core tests. The other task (WeWork-Frontent) owns adapters/sdh/runtime-manager/host-main/desktop and `src/api`, `src/runtime`, `src/state`, `src/components`. Only these two tasks participate. User approved shared-main implementation and exempted sdh source maintenance from its internal runtime-agent instructions. No further gate or permission request is required.

Current gaps: group chat copies private workbench messages and optimistic local messages instead of reading authoritative group state; sendTeamMessage persists but never dispatches; handoff is only a progress note; cancellation removes tasks without a durable archive; RuntimeManager cancel acknowledges abort before execution is terminal. Existing document revision and delivery acceptance rules remain intact.

### Task 1: Durable inbox and handoff business operations

**Files:**
- Create: `src/local/collaborationState.ts`, `src/local/collaborationState.test.ts`
- Modify: `src/local/localWeWorkApi.ts`, `src/domain/wework.ts`
- Test: `src/local/localWeWorkApi.test.ts`

**Interfaces:**
```ts
type CollaborationDelivery = {
  id: string; teamId: string; messageId: string; employeeId: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'uncertain';
  runId?: string; error?: string; createdAt: string;
};
type Handoff = {
  id: string; workId: string; fromEmployeeId: string; toEmployeeId: string;
  note: string; status: 'requested' | 'accepted' | 'rejected';
  createdAt: string; decidedAt?: string;
};
// Owner-only operations; tools receive actor via the Host closure.
postGroupMessage(teamId, {text, recipientId?, requestId}): Promise<MessageItem>;
requestHandoff(workId, {targetEmployeeId,note}, actor): Promise<Handoff>;
decideHandoff(teamId, {handoffId,decision:'accepted'|'rejected'}): Promise<Handoff>;
```

- [x] Add regression tests against a MemoryWeWorkStorage instance and a second API instance reading the same storage:
```ts
const message = await api.postGroupMessage(team.id, { text: 'Review this', recipientId: reviewer.id, requestId: 'request-1' });
await api.postGroupMessage(team.id, { text: 'Review this', recipientId: reviewer.id, requestId: 'request-1' });
const saved = (await restarted.snapshot()).teams.find(t => t.id === team.id)!;
expect(saved.teamMessages?.filter(m => m.id === message.id)).toHaveLength(1);
expect(saved.collaborationDeliveries).toHaveLength(1);
expect(saved.collaborationDeliveries[0].employeeId).toBe(reviewer.id);
```
- [x] Run `npm run test:web -- src/local/collaborationState.test.ts` and verify the regression cases.
- [x] Implement same-transaction message+inbox creation, explicit recipient validation, fallback to the one team lead, deduplication by request ID. Reject empty/overlong text, ambiguous or foreign recipients, and different payload reuse of a request ID.
- [x] Implement persisted requested/accepted/rejected handoffs; accepted handoff checks current ownership again, preserves WorkRecords, moves the task atomically to the target's current slot or queue, and is idempotent. Rejection changes no ownership. Completed tasks and stale requests reject acceptance.
- [x] Retain cancelled tasks in a separate team history collection with original WorkRecords and assignment provenance; do not reuse the work ID for a new task. Extend task lookup/listing so archived tasks remain inspectable but cannot be assigned or completed.
- [x] Test stale ownership, cross-team targets, repeated approval, rejected requests, cancellation record preservation, and restart persistence; run the targeted tests; commit only the core-owned files.

### Task 2: Host collaboration execution and authority boundary

**Files:**
- Create: `app-runtime/src/host/collaboration-coordinator.js`, `app-runtime/test/collaboration-coordinator.test.js`
- Modify: `app-runtime/src/host/wework-service.js`, `app-runtime/src/wework-tools.js`
- Integration owned by adapters task: `app-runtime/src/host-main.js`, `app-runtime/src/host/runtime-manager.js`

**Interfaces:**
```js
new CollaborationCoordinator({ wework, runtime });
coordinator.drain(); // serialized, one active delivery per employee
coordinator.recover(); // reconcile persisted run IDs; never replay uncertain side effects
wework.startRun({id, wework:{deliveryId}}, runtime); // admission lock across prepare/start
wework.prepare({id, wework:{deliveryId}}); // resolve message/recipient/profile from Host state
runtime.cancelAndWait(runId); // resolves only after adapter stops and outcome is persisted
```

- [x] Add a fake runtime with a gate and test delivery on Host without renderer:
```js
await coordinator.drain();
await coordinator.drain();
assert.equal(started.length, 1);
release({ finalText: 'Reviewed', messages: [] });
await eventually(() => deliveryStatus() === 'succeeded');
assert.equal(groupReplies().length, 1);
assert.equal(privateWorkbenchMessages().length, 0);
```
- [x] Run `node --test app-runtime/test/collaboration-coordinator.test.js` and verify coordinator behavior.
- [x] Reserve inbox run ID before starting. On restart query the persisted run; recover terminal result idempotently, keep active entries pending reconciliation, and surface missing/unknown run instead of blindly replaying.
- [x] Make group delivery Session identity distinct from private workbench/task Session; use team+employee+group+profile identity. Inject only bounded public group context and exact message reference; never include private employee sessions. Group replies append with run/delivery IDs for idempotency.
- [x] Permit scoped group read/reply tools and explicit collaboration requests, not arbitrary task write/approval. Keep existing task context/read/output tools and stale-input checks. Handoff tool creates a formal request rather than ownership mutation; approval remains UI-only.
- [x] Guard complete/return/cancel/reassign/reset/member removal/Harness replacement with Host runtime state. Cancellation/transfer must await terminal acknowledgment. Cancellation failure preserves owner and exposes a recoverable error.
- [x] Test cancellation-before-transfer, late output rejection, duplicate terminal events, no auto-broadcast reply loop, offline adapter, unknown run recovery and group/private context isolation. Coordinate integration with adapters task, run runtime tests; keep core changes in their own commit.

### Task 3: UI entry points and end-to-end validation

**Files:**
- Modify: `src/components/team/TeamManagementView.tsx`, `src/state/weworkStore.ts`, `src/api/hostWeWorkApi.ts`, `src/api/weworkApi.ts`, `src/runtime/weworkHost.ts`
- Create: `src/components/team/TeamChatView.tsx`, `src/components/team/HandoffRequests.tsx`
- Update: `docs/wework-harness.md`

**Interfaces:** UI invokes the Task 1 methods through authenticated `weworkCall`; Host drives dispatch, not Zustand. Browser-local mode may persist/inspect messages and requests but must show execution as unavailable without a Host. Remote mode does not pretend the new API exists.

- [ ] Add state/API tests proving post failure preserves input, a returned authoritative message is not appended twice, and hydrate updates group replies.
- [ ] Extract TeamChatView. Render `team.teamMessages` only, not employee histories. Add recipient selector (default lead), accessible member click-to-select, delivery status/error display, retry only for an explicitly failed delivery, and Enter/Shift+Enter/IME handling.
- [ ] Add handoff request list with target, reason, status and owner-only approve/reject actions. Preserve task records on reassignment and show cancellation confirmation/error rather than optimistic owner changes.
- [ ] Align UI Harness status with the adapters descriptor: no always-available Pi, no nonexistent installations, and no claim that unsupported tool transport can execute WeWork work. Bind workspace/Skills through the adapter contract agreed with the other task.
- [ ] Run `npm test`, `npm run build`, and packaged runtime smoke test using temporary WeWork storage.
- [ ] Browser test: send to selected employee, refresh/read persistent reply, reject/approve handoff, inspect unchanged document revisions, switch teams without message leakage. Desktop-only test: launch bundled sdh, verify absent external Pi is not used, cancel real execution and recover session. Report separately any real model/provider tests not executable in this environment.
- [ ] Review task-specific diffs and then the combined changes. Update docs with implemented capabilities and remaining platform limitations; commit UI separately from adapter/sdh work.

## Pre-implementation gates

- [x] Existing WeWork Tools/context author confirms baseline ownership and file split.
- [x] User confirms shared main workspace or chooses an isolated worktree; no automatic branch switching while another task shares the checkout.
- [x] User authorizes sdh source edits notwithstanding its HTTP-only agent instructions.
- [x] Adapters task confirms tools transport, terminal cancellation acknowledgment and Workspace/Session contract.

## Core implementation evidence

Core targeted tests: `src/local/collaborationState.test.ts` (6) and `app-runtime/test/collaboration-coordinator.test.js` (7). Existing work-context tests retained. Startup admission is fenced against simultaneous handoff; cancellation failure retains ownership; uncertain runs are never automatically replayed. Group read/reply/collaboration tools never get private task mutation tools. Derived dispatch budget: depth 2, 8 deliveries per user root. Handoff acceptance remains owner-only. UI integration checklist above is owned and validated by WeWork-Frontent.

Joint runtime validation: `node --test app-runtime/test/group-sdh-integration.test.js` passed with a real sdh runner child, IPC tool calls, local HTTP model fixture, public reply persistence, native Session continuation and private-history exclusion. External-provider/CLI execution is not claimed by this test.
