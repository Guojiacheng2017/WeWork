# Main Workspace Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task in the user-requested current checkout. Preserve unrelated changes; no automatic commits or version bump.

**Goal:** Replace permanent three-column navigation with a resizable roundtable/content workspace using existing WeWork business components.

**Architecture:** App retains startup, hydration and application dialogs. A workspace shell owns persisted team/employee page desks and layout. EmployeeWorkbench gains an explicit content presentation contract instead of nesting its modal/sidebar in the right card.

**Tech Stack:** React, TypeScript, Zustand, existing Three.js roundtable, Vitest, Vite/Electron.

## Global Constraints

- Only WeWork; no SDH UI or DAG business changes.
- Work directly on current code; preserve landing and existing session/runtime/settings behavior.
- Normal right pane is 1/3–1/2; expanded mode uses a narrow employee rail.
- Private pages reuse existing sessions; closing pages never deletes business data.
- Team and employee desks are independent. New page is a chooser, not automatically settings.
- New employee opens configuration, not a runnable default harness session.
- macOS Cmd / Windows Ctrl shortcuts; never hijack editable fields for employee cycling.

### Task 1: Page model
Files: `src/components/workspace/workspacePages.ts`, `workspacePages.test.ts`.
- [x] Test team/employee isolation, content deduplication, active-page close, blank-page creation and width clamp.
- [x] Implement immutable desk operations and validated local persistence; existing session IDs remain business-owned.
- [x] Run `npx vitest run src/components/workspace/workspacePages.test.ts`.

### Task 2: Existing content presentation
Files: `src/components/workbench/EmployeeWorkbench.tsx`, `src/components/layout/PendingWorkBar.tsx`.
- [x] Add explicit embedded conversation presentation: no modal focus trap, internal tabs or employee sidebar. Keep existing send/stop/model/context/task logic.
- [x] Expose existing team chat and work content without duplicating sending logic.
- [x] Keep settings and details reachable as content pages; block unconfigured employee sending.
- [x] Run TypeScript and existing workbench tests.

### Task 3: Main workspace
Files: `src/components/workspace/MainWorkspace.tsx`, `workspace.css`, `src/App.tsx`, `src/components/WeWorkStage3D.tsx`.
- [x] Add upper-left team selector/create/archive access and lower-left account capsule/brand.
- [x] Keep StageHeader view navigation and project/DAG views reachable; preserve startup.
- [x] Render team/employee tabs and chooser, settings, pending work and overview through existing components.
- [x] Add ratio splitter, expanded employee rail, persistent desks, drafts and selected tabs.
- [x] Remove add seat in this presentation; preserve actual camera animation and switch employee content on settled focus.
- [x] Add guarded Tab cycling, new page and new employee keyboard actions with visible alternatives.
- [x] Run build and targeted tests.

### Task 4: Runtime verification
- [x] Inspect running WeWork with isolated data, normal and expanded widths.
- [x] Verify team/employee switching, chooser deduplication, settings, new employee, keyboard guards and collapse restoration.
- [x] Check no third column, clipped controls or native titlebar overlap.
- [x] Report verified outcomes and remaining limitations without overwriting a packaged installation.

## Verification evidence

- Web regression: 43 files / 216 tests passed; TypeScript and production web build passed (existing large-bundle warning remains).
- Isolated browser QA: team/employee desks, private/group/task pages, drafts, settings edits, shortcuts, new unconfigured employee, resize, expand/collapse and 1100px layout passed; no console/page errors.
- Actual Electron + Host QA used a temporary documents/profile directory: existing landing, team selection, animated employee focus, new-page chooser, settings and expanded rail passed without runtime errors.
- Evidence: `/tmp/wework-workspace-native.png`, `/tmp/wework-workspace-native-expanded.png`, `/tmp/wework-workspace-narrow.png`.
- Existing navigation and business components remain in place; exhaustive project/DAG business testing and Windows-native verification were not performed in this UI task.
- No packaged installation was overwritten; version remains 2.1.0. Last employee focus is not restored on reload; per-context open pages persist.
