# WeWork V2 Interaction Closure Audit

Date: 2026-08-26

Scope: all visible clickable and draggable controls except model-backed chat behavior.

## Status legend

- Closed: the action has a visible result and a usable return path.
- Demo only: the action changes Zustand memory, but has no persistence or backend contract.
- Missing: the control is visible but has no effective action, or the product flow stops without a next step.
- Conflict: the implementation contradicts an agreed interaction rule.

## Interaction inventory

| Area | Interaction | Result | Status |
| --- | --- | --- | --- |
| Team sidebar | Select team | Header, employees and pending work switch to the selected team | Closed in UI; demo-only data |
| Team sidebar | New team | Form creates, selects and persists a team locally | Closed locally; backend sync absent |
| New team | Runtime choice | Choice is reflected in the new lead record | Demo only; no runtime validation or provisioning |
| New team | Submit | Team and lead appear; workspace returns to round-table/top-down | Closed locally |
| Header | Round table / Team management / DAG | Main workspace switches among three peer views | Closed |
| Pending work | Expand / collapse | Drawer and compact trigger switch correctly | Closed |
| Pending work | Create / inspect | Team-level form creates a task; card opens its details | Closed locally |
| Pending work | Drag to round-table employee | Item enters the employee's current task or queue | Closed locally; runtime delivery absent |
| Pending work | Drag to DAG node | Work is assigned to the node's current employee | Demo only; the workflow node itself is not updated |
| Round table | Previous / next | Selection rotates cyclically | Closed |
| Round table | Select employee | First click selects; selected employee enters eye-level; next click opens workbench | Closed |
| Round table | Click empty stage | Returns to top-down without resetting azimuth | Closed |
| Round table | Select add seat | First click selects; second click opens employee creation | Closed |
| Team management | Add employee | Form creates a member card | Demo only; reload loses it and runtime is not provisioned |
| Team management | Open member | Opens the employee workbench | Closed |
| Team management | Remove / transfer lead | Supports lead transfer and removing non-leads; unfinished work returns to pending | Closed locally |
| Team management | Permissions | No authenticated permission model exists | Missing backend/domain contract |
| DAG | Click assigned node | Opens workbench; node supports keyboard activation | Closed |
| DAG | Reposition | Nodes can move forward/backward and retain dependency IDs | Closed locally |
| DAG | Edit/connect | Local editor supports workflow metadata, node create/delete, assignee, status, dependencies and ordering; cyclic dependencies are rejected | Closed locally |
| DAG | Version/publish/permissions | No workflow version service, runtime publication or role-based authorization | Missing backend/domain contract |
| DAG | Dependency progression | Dependencies and node status are editable and persisted locally; runtime-driven automatic progression is not connected | Partial: local model closed, runtime missing |
| Workbench | Close | Returns to the underlying team view | Closed |
| Workbench | Context and metrics | Read-only, data-driven cards render | Closed as display-only |
| Workbench | Skill inspection/management | Tags are display-only | Missing |
| Workbench | Artifact `View` | Opens metadata details and clearly reports unavailable file service | Closed for current data boundary |
| Workbench | Work list / completion / return | Current, queued and completed work are visible; complete/return promote the queue | Closed locally |
| Workbench | Handoff | No multi-recipient handoff package | Missing domain contract |

## Cross-cutting gaps

1. Local persistence exists, but there is no API client, server reconciliation or multi-user conflict handling.
2. Runtime names are explicitly configuration labels only. No Pi, Claude Code, DSH or Workspace adapter is connected.
3. Local task lifecycle covers pending, current, queued, returned and completed work. Retry, failure recovery and handoff packages remain absent.
4. Workflow nodes still do not own work instances. Dropping on a node assigns to its bound employee.
5. Workflow dependency authoring, validation, versioning and permission boundaries are absent.
6. Artifacts have metadata details only. Storage, binary preview, download and provenance remain absent.

## Structural correction applied during audit

`PendingWorkBar` now remains available in round-table, DAG and team-management views. It is a team-level work source rather than a child of a particular visualization.
