# Employee Workflow Motion Feedback

Status: approved product requirement; implementation deferred.

## Objective

Employee motion should confirm workflow state, not continuously attract attention. Current reused motion and eye behavior are too active for the team-workflow context. In particular, a continuously rotating working state is unsuitable.

## Proposed Motion Language

### Default / Idle

- Remain nearly still.
- Allow only very subtle, low-frequency breathing.
- Never rotate continuously.

### Drag Hover / Can Accept

- When a task card hovers over an eligible Employee, give that Employee a clear acceptance-focus state.
- Possible signals: outline highlight, slight lift, or orientation toward the task.
- Show a short ownership hint.
- De-emphasize ineligible employees.

### Successful Dispatch

- Animate the card or task marker briefly attaching to or flowing into the target Employee.
- Play one restrained confirmation gesture.
- Immediately update the Employee's current-work or pending-work summary.
- Treat the bottom-right toast as secondary feedback; dismiss it automatically after a short interval.

### Working

- Express stable, focused, low-noise activity.
- Do not use looping rotation.

### Completed / Human Confirmation / Blocked

- Give each outcome a distinct, one-shot short motion and persistent state marker.
- Ensure the outcome remains understandable without reading a corner notification.

## Principles

- One state communicates one meaning.
- Motion direction follows click targets and spatial navigation.
- Avoid continuous movement added only for anthropomorphism.
- Workflow comprehension takes priority over decorative personality.

## Implementation Boundary

This document defines required behavior but does not prescribe a specific state-machine or rendering implementation. The product baseline determines when implementation begins.
