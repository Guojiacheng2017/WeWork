# Team Capability Modules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hot-pluggable team capabilities and a persistent shared collaboration database, with closed-loop Issues, Board, and Gantt views while preserving a fully functional lightweight chat/Harness core.

**Architecture:** Each team owns a module registry plus one normalized collaboration database. A project-management service validates capability boundaries and performs all mutations, so every UI view and Agent tool observes the same persisted records. The existing snapshot storage remains the compatibility boundary; migration adds defaults without forcing optional modules to load.

**Tech Stack:** TypeScript, React 19, Zustand, Vitest, Node.js runtime tools, existing team-partitioned JSON workspace storage.

## Global Constraints

- Develop directly on `main` in the current saved directory; do not create a worktree or branch.
- Baseline commit is `3fd3b03`.
- Product name is WeWork; never reintroduce Office naming.
- Team, employee, group chat, targeted/broadcast dispatch, Harness execution, and replies remain the optional-module-free core.
- Disabled modules retain data; data deletion is a separate confirmed action.
- Optional UI, tools, subscriptions, schema/runtime behavior load only when their capability is enabled.
- Do not copy Linear UI or merge Plane AGPL/OpenProject GPL source.

---

### Task 1: Registry, database schema, and migration

**Files:**
- Create: `src/domain/collaboration.ts`
- Modify: `src/domain/wework.ts`
- Modify: `src/local/localWeWorkApi.ts`
- Test: `src/local/projectManagement.test.ts`

**Interfaces:**
- Produces: `TeamModuleRegistry`, `CollaborationDatabase`, `normalizeTeamModules`, `normalizeCollaborationDatabase`, and API methods to configure capabilities and CRUD shared work items.

- [ ] Write failing tests proving a new team has no optional module, legacy snapshots migrate safely, enabling Project Management provisions one database, disabling retains it, explicit deletion clears it, and restart preserves it.
- [ ] Run `npm run test:web -- src/local/projectManagement.test.ts` and confirm failures are caused by missing APIs/types.
- [ ] Implement normalized schema/version migration and capability-gated mutations through the local API.
- [ ] Re-run the focused test to green and refactor without changing behavior.

### Task 2: Capability-derived Agent tools

**Files:**
- Modify: `app-runtime/src/wework-tools.js`
- Test: `app-runtime/test/wework-tools.test.js`

**Interfaces:**
- Consumes: `team.modules.capabilities` and collaboration API methods.
- Produces: base collaboration tools for every team plus Issue/Board/Gantt tools only for enabled capabilities.

- [ ] Add failing tests asserting lightweight group teams never receive project tools, Issues enables work-item tools, and disabled capabilities remove tools without deleting records.
- [ ] Run `npm --workspace wework-app-runtime test -- --test-name-pattern="capability"` and confirm expected failures.
- [ ] Derive definitions per current team at tool creation and route project tool execution through the shared database API.
- [ ] Re-run focused runtime tests to green.

### Task 3: Dynamic module UI and three shared views

**Files:**
- Create: `src/components/project/ProjectManagementView.tsx`
- Create: `src/components/project/IssuesView.tsx`
- Create: `src/components/project/BoardView.tsx`
- Create: `src/components/project/GanttView.tsx`
- Create: `src/components/project/projectViewModel.ts`
- Modify: `src/components/layout/StageHeader.tsx`
- Modify: `src/components/team/TeamManagementView.tsx`
- Modify: `src/App.tsx`
- Modify: `src/state/weworkStore.ts`
- Modify: `src/api/weworkApi.ts`
- Modify: `src/api/hostWeWorkApi.ts`
- Modify: `src/index.css`
- Test: `src/components/project/projectViewModel.test.ts`

**Interfaces:**
- Consumes: the single `CollaborationDatabase` and capability configuration API.
- Produces: capability-gated navigation and Issues/Board/Gantt projections whose edits call the same work-item mutation.

- [ ] Add failing projection tests showing status/date edits appear consistently in Issues, Board, and Gantt models.
- [ ] Run the focused Vitest file and confirm the missing view-model failure.
- [ ] Implement lazy-loaded project UI, team module controls, capability navigation, create/edit/status/date flows, and separately confirmed database deletion.
- [ ] Re-run focused tests and `npm run build:web`.

### Task 4: Persistence and boundary regression suite

**Files:**
- Modify: `app-runtime/test/team-partitioned-wework-storage.test.js`
- Modify: `src/local/projectManagement.test.ts`
- Modify: `app-runtime/test/wework-tools.test.js`
- Modify: `README.md`

**Interfaces:**
- Validates: lightweight core, enable/disable retention, cross-view consistency, restart persistence, dynamic Agent-tool boundaries.

- [ ] Add a disk-backed restart test for collaboration data and a regression that the unmodified group-chat flow works with no modules.
- [ ] Run focused web/runtime persistence and tool tests, confirming any new test fails before its production fix.
- [ ] Update WeWork documentation with module lifecycle, capability matrix, and data retention/deletion semantics.
- [ ] Run `npm test`, `npm run build`, inspect `git diff --check`, and search changed product code for forbidden Office naming.
- [ ] Commit all scoped changes once as a new independent commit.

## Self-review

- Spec coverage: core independence, explicit install/enable, six capability flags, unload boundaries, retention/deletion, unified schema, persistence, three closed-loop views, dynamic tools, and requested regressions are mapped above.
- Placeholder scan: no deferred implementation placeholders remain.
- Type consistency: UI and runtime both consume `team.modules.capabilities`; every project view reads `team.collaborationDatabase` and writes through the same API methods.
