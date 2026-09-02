# WeWork Workspace and Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Documents/WeWork` the canonical team workspace root, make `Documents/.wework` the device-default configuration root, and resolve structured configuration plus `WEWORK.md` prompts through global → team → employee → session precedence.

**Architecture:** A focused `WeWorkWorkspaceLayout` owns safe, ID-based filesystem paths and initializes human-readable team/employee workspaces. A separate `WeWorkConfigurationResolver` reads bounded JSON and Markdown layers without secrets, merges structured values field-by-field, and returns prompt layers in deterministic order. `WeWorkService` resolves these values while preparing a run; the renderer receives only path/status metadata through the existing Host bridge.

**Tech Stack:** Node.js ESM sidecar, TypeScript/React renderer, Node test runner, Vitest, Electron preload bridge.

## Global Constraints

- Default team workspaces live under `~/Documents/WeWork/<team-id>/`.
- Device defaults live under `~/Documents/.wework/` and never contain model or SSH secrets.
- Team and employee directories use immutable IDs; display names live in manifests.
- `WEWORK.md` contains natural-language instructions; `.wework/config.json` contains structured overrides.
- Precedence is WeWork built-in → device default → team → employee → session/task.
- Employee membership creates an independent team-local directory; symlinks are not created by default.
- Runtime databases, locks and checkpoints are not treated as Git-mergeable workspace documents.

---

### Task 1: Canonical workspace layout and safe initialization

**Files:**
- Create: `app-runtime/src/host/wework-workspace-layout.js`
- Create: `app-runtime/test/wework-workspace-layout.test.js`
- Modify: `app-runtime/src/host-main.js`

**Interfaces:**
- Produces: `new WeWorkWorkspaceLayout({ weworkRoot, configRoot })`
- Produces: `paths(teamId, employeeId?)`, `ensureTeam(team)`, `ensureEmployee(team, employee)`

- [ ] Write tests asserting canonical `Documents/WeWork/<safe-id>` structure, manifests, required directories, no symlinks, and traversal rejection.
- [ ] Run `node --test test/wework-workspace-layout.test.js` and observe failure because the module does not exist.
- [ ] Implement safe ID validation, atomic JSON writes, and idempotent directory initialization.
- [ ] Rerun the focused test and commit the independently working layout.

### Task 2: Layered `.wework` configuration and `WEWORK.md` prompts

**Files:**
- Create: `app-runtime/src/host/wework-configuration.js`
- Create: `app-runtime/test/wework-configuration.test.js`

**Interfaces:**
- Produces: `resolveWeWorkConfiguration({ configRoot, teamRoot, employeeRoot, sessionConfig?, taskConfig? })`
- Returns: `{ config, prompts: Array<{ scope, path, content }> }`

- [ ] Write tests for field-level deep merge, deterministic prompt order, missing files, malformed/oversized files, and secret-key rejection.
- [ ] Run the focused test and observe the missing-module failure.
- [ ] Implement bounded reads, plain-object deep merge, prompt collection, and secret-field rejection.
- [ ] Rerun the focused test and commit the resolver.

### Task 3: Host persistence and runtime resolution

**Files:**
- Modify: `app-runtime/src/host/team-partitioned-wework-storage.js`
- Modify: `app-runtime/src/host/wework-service.js`
- Modify: `app-runtime/src/host-main.js`
- Modify: `app-runtime/test/team-partitioned-wework-storage.test.js`
- Create: `app-runtime/test/wework-service-workspace.test.js`

**Interfaces:**
- Consumes: `WeWorkWorkspaceLayout`, `resolveWeWorkConfiguration`
- Produces: prepared run `workspace`, effective structured `weworkConfig`, and ordered `weworkPrompts`

- [ ] Add failing migration tests for the prior `~/.wework`/hashed team snapshots and canonical team-root storage.
- [ ] Add failing run-preparation tests for team fallback workspace, employee override, and layered prompt/config resolution.
- [ ] Implement canonical team snapshot paths, non-destructive legacy import, team/employee initialization hooks, and run preparation.
- [ ] Run all Runtime tests and commit Host integration.

### Task 4: Team workspace configuration surface

**Files:**
- Modify: `src/domain/wework.ts`
- Modify: `src/api/weworkApi.ts`
- Modify: `src/local/localWeWorkApi.ts`
- Modify: `src/state/weworkStore.ts`
- Modify: `src/components/team/TeamManagementView.tsx`
- Modify: `src/components/modals/DataWorkspaceSettings.tsx`
- Test: `src/local/localWeWorkApi.test.ts`

**Interfaces:**
- Produces: team-level `workspaceAssignment` editing and clear inheritance labels in employee configuration.

- [ ] Add failing API tests for saving team Workspace independently from employees.
- [ ] Implement the domain/store mutation and a Team Settings tab with current/default/local/SSH modes.
- [ ] Show resolved path hierarchy and explain employee override versus team inheritance.
- [ ] Run Web tests and browser-test save/reopen behavior.

### Task 5: Full verification and migration documentation

**Files:**
- Modify: `docs/product/2026-08-27-wework-app-service-architecture.md`
- Modify: `docs/wework-harness.md`

- [ ] Document the canonical tree, sync-safe files, local-only state, credential references, and precedence.
- [ ] Run `npm test`, `npm run build`, Desktop packaging, and a browser interaction loop.
- [ ] Verify `git diff --check`, record remaining platform limitations, and commit documentation separately.
