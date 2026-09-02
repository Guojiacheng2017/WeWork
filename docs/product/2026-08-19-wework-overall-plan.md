# WeWork Overall Plan

## Product Surface

```mermaid
flowchart LR
  L["Team navigation"] --> C["Round-table wework"]
  L --> G["Fixed role DAG"]
  C --> TM["Team management overlay"]
  C --> EW["Employee workspace"]
  G --> EW
  P["Collapsed pending work"] --> D["Drag assignment"]
  D --> WI["Employee WorkItems"]
  D --> WF["Workflow instance"]
  WF --> WI
  WI --> O["Output records and artifacts"]
  TM --> TC["Team Context"]
  TM --> PB["Optional progress board"]
  EW --> SC["Scoped Session context"]
  EW --> WL["Employee worklist"]
```

## Runtime and Context Architecture

```mermaid
flowchart TB
  UI["WeWork Web"] --> API["WeWork API"]

  API --> TEAM["Team / Lead / Module config"]
  API --> PAPER["Paperwork / WorkItem / OutputRecord"]
  API --> FLOW["WorkflowTemplate / WorkflowInstance / RoleNode"]
  API --> CTX["TeamContext / ContextGrant / ContextProposal"]
  API --> REG["Runtime adapter registry"]

  REG --> PI["Pi adapter"]
  REG --> CLAUDE["Claude Code adapter"]
  REG --> DSH["DSH adapter"]
  REG --> WSA["Workspace task adapter"]

  PAPER --> COMPOSE["ContextComposer"]
  CTX --> COMPOSE
  TEAM --> COMPOSE
  COMPOSE --> SESSION["Employee Session / Run"]
  SESSION --> OUTPUT["Employee-owned output"]
  OUTPUT --> BOARD["Collapsed progress summary"]
  OUTPUT --> PROPOSAL["Context proposal"]
  PROPOSAL --> REVIEW{"Human or lead accepts?"}
  REVIEW -->|Yes| CTX
  REVIEW -->|No| OUTPUT
```

## Context Boundary

```mermaid
flowchart LR
  subgraph Shared["Team shared scope"]
    BRIEF["Team brief"]
    DECISION["Accepted decisions"]
    MILESTONE["Accepted milestone summaries"]
    SHARED["Shared artifacts"]
  end

  subgraph Employee["Employee private scope"]
    WORK["Assigned WorkItem"]
    SESSION["Session history"]
    TRACE["Tool traces and notes"]
    DETAIL["Detailed output"]
  end

  GRANT["ContextGrant"] --> BRIEF
  GRANT --> DECISION
  GRANT --> MILESTONE
  GRANT --> SHARED
  BRIEF --> RUN["Run context"]
  DECISION --> RUN
  WORK --> RUN
  SESSION --> RUN
  TRACE -. "not shared by default" .-> Employee
  DETAIL --> PROPOSAL["ContextProposal"]
  PROPOSAL --> MILESTONE
```

## Delivery Sequence

1. **Interaction validation**: quiet desktop layout, round-table navigation, collapsible pending work, and drag assignment.
2. **Team foundation**: templates, first employee, lead invariant, TeamContext, module providers.
3. **Runtime registry**: per-employee Pi/Claude Code/DSH adapters and capability negotiation.
4. **Pending-work distribution**: Paperwork/Digital metadata, direct WorkItems or role-DAG WorkflowInstances, ContextGrant, ContextComposer, and employee worklists.
5. **Progress and responsibility**: OutputRecord, collapsed board summaries, detail expansion, reviews.
6. **Handoff**: work reassignment, context package, successor verification, offboarding.
7. **External modules**: provider adapters for existing boards/context systems plus built-in lightweight implementations.

## Prototype Boundary

- Desktop only.
- No group chat, team completion percentage, or permanent progress dashboard.
- Pending work is collapsed by default and expands only for assignment.
- A team may use either round-table collaboration or a fixed role-DAG as its main view.
- Paperwork and Digital are metadata in one pending-work flow.
- Runtime state must come from a real adapter; unavailable adapters remain visibly unconfigured.
- Team management and employee detail open on demand instead of occupying permanent page columns.
