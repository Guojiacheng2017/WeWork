# Fixed Workflow DAG Visual Design

Status: approved visual direction; implementation deferred.

## Purpose

Some teams are better understood as a repeatable flow than as employees seated around a table. For those teams, WeWork replaces the round-table stage with a fixed role DAG selected according to the incoming work.

The DAG answers three questions directly:

1. Which role owns the current step?
2. What must be produced before the next role can begin?
3. Where is the work blocked or waiting?

## Model

- `WorkflowTemplate`: versioned role graph selected by work type.
- `RoleNode`: required role, capabilities, input contract, output contract, and completion policy.
- `WorkflowEdge`: dependency and handoff rule.
- `WorkflowInstance`: one execution of a template for one pending-work item.
- `NodeAssignment`: responsible employee and WorkItem for one node instance.

Roles belong to the workflow definition. Employees are resolved at execution time. A workflow therefore survives employee replacement and mixed runtime adapters.

## Visual Structure

- Use one primary left-to-right or top-to-bottom reading direction.
- Keep the active path centered and visible without page-scale panning.
- Render role nodes as restrained employee stations containing role, assigned Employee, and concise state.
- Use connectors only to express real dependencies.
- Completed nodes recede; the active node is strongest; future nodes remain low contrast.
- Parallel branches share one split and one explicit join.
- Blocked nodes retain a persistent marker and name the missing dependency.
- Node detail opens on demand instead of expanding every card in the graph.
- Preserve whitespace around the active path; do not fill the canvas with status panels.

## Assignment and Execution

1. User expands pending work.
2. WeWork proposes a WorkflowTemplate from work metadata.
3. WeWork resolves each role to an eligible employee.
4. User reviews unresolved or ambiguous assignments.
5. Dropping work onto the DAG creates a WorkflowInstance and the first ready WorkItems.
6. Node completion releases downstream nodes whose dependencies are satisfied.
7. Outputs move through typed handoffs; full upstream Session history is not copied automatically.

If no template matches, WeWork falls back to direct round-table assignment.

## Interaction Boundary

- Selecting a role node focuses it and exposes its employee and WorkItem summary.
- Opening the focused employee uses the same employee workbench as round-table mode.
- Runtime controls remain capability-driven.
- Workflow progress is node state, not a fabricated team completion percentage.
- Users cannot freely draw nodes or edges in the competition prototype.

## Motion

- Dispatch enters the first ready node.
- A completed node emits one restrained handoff signal along outgoing edges.
- The next ready node gains focus only after dependency resolution.
- Parallel branches animate independently; joins activate once their policy is satisfied.
- No continuous connector particles or decorative looping motion.

## Prototype Scope

- One versioned workflow template.
- One linear path with an optional parallel branch and join.
- Automatic role-to-employee resolution with manual correction.
- Node states: waiting, ready, running, blocked, review, completed, failed.
- Shared employee workbench and artifact inspection.

Deferred: arbitrary graph authoring, nested workflows, dynamic graph mutation, cross-team workflows, and external orchestration editors.
