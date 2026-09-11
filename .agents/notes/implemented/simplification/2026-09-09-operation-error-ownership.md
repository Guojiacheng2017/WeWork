# Agent Note: Give connectivity and operation notices separate owners
Status: implemented

## Problem
[weworkStore](../../../../src/state/weworkStore.ts) stores both hydration failures and per-operation failures in serviceError. reportError no longer changes serviceStatus, but successful hydrate and event updates still clear that same field. [EmployeeWorkbench](../../../../src/components/workbench/EmployeeWorkbench.tsx) and [TeamManagementView](../../../../src/components/team/TeamManagementView.tsx) consume it, while [App](../../../../src/App.tsx) also uses it for startup failures. Thus an unrelated successful event can erase an operation error, and a notice can be shown outside the operation's employee context. These are production read/write paths, not test-only abstractions.

## Proposal
Use a connection result owned by hydration/event connectivity and one scoped operation notice owned by the initiating operation. Reuse one dismissible notice view. Remove the distributed serviceError-null assignments from unrelated successful events; dismiss or replace notices explicitly. Preserve employee execution history and acknowledgedErrorKey, which represent durable diagnostic state rather than temporary operation feedback.

## What we give up
A global success will no longer implicitly dismiss all errors. Avoid building a notification queue or durable error store: one scoped current notice is sufficient for the existing product.

## Acceptance criteria
An employee A failure cannot appear as employee B's operation failure; unrelated hydration does not erase it. Initial load failure still offers recovery, a later connection failure preserves loaded data, and successful reconnection clears only the connection error. Test dismiss, scope switching and draft retention without pinning incidental rendering structure.

## Risks
The same error may currently be handled by both a local form and the Store. Assign one display owner at each caller before deleting a path; do not hide failures merely to eliminate duplicate messages.

## Verification
Implemented on 2026-09-09. Frontend tests, runtime tests and production build passed. Isolated Electron/Pi checks covered employee creation, first reply, restart/resume, context restart/history and cancellation before deletion. Browser fault injection verified draft preservation, dismissal, refresh retention and employee notice isolation. External adapters retain their existing path; no new real remote-adapter verification was performed.
