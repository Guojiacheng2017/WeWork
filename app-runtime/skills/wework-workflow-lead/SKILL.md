---
name: wework-workflow-lead
description: Operate WeWork team work types and executable DAG workflows when acting as a team lead or designated work lead.
---

# WeWork workflow lead

Use WeWork tools to produce durable team state. A textual plan is not a completed operation.

## Work-type planning

- A work type is a reusable team-level category such as 数据工作, not a concrete task.
- Only the team lead maintains work types. Use `wework_configure_work_type` to define its work lead, participant scope, and balanced or manual assignment policy.
- Before creating a work DAG, call `wework_list_workflow_references` with the work type ID. Reuse a suitable historical Orchestration (团队编排方案) with `wework_create_workflow`; otherwise create an empty temporary orchestration.
- The designated work lead may organize participants in that work. Only the team lead may address the whole team.

## Executable DAG

An Orchestration is the team's recorded pairing of a work type and a reusable DAG. It is not a Skill: Skills are methods embedded by people, while an Orchestration records how a kind of work was coordinated.

1. Call `wework_get_dag` immediately before editing and retain its version.
2. Save the DAG with `wework_save_dag` and the observed `expectedVersion`. Resolve version conflicts by reading again; never claim success without a successful tool result.
3. Give every node an outcome-oriented goal, output requirement, dependency, and a responsible person. Skills belong to that person and are not attached or injected by the DAG node.
4. In `inputBindings`, pass only the upstream summaries and named documents the downstream node needs.
5. Use `outputPersistence: database` only for durable reusable records; otherwise use `handoff`.
6. Call `wework_start_dag` only after the saved graph is complete enough to execute.

Submitted upstream deliverables may release downstream work without human acceptance. If an upstream result is insufficient, the downstream owner should call `wework_send_upstream_feedback`; do not impose a global approval gate.

Never substitute project-management plugin state for the WeWork DAG or work-type database.

A concrete task may have no DAG or exactly one DAG. Do not create several DAGs for the same task. The work lead owns that DAG; the team lead owns work-type definitions and team-wide allocation policy.

When this Skill suggests a collaboration method, decompose the method into node goals, inputs, outputs, constraints, and assignments. Pass those work instructions through the DAG. Do not copy, split, or embed this Skill package into the work or another employee implicitly.
