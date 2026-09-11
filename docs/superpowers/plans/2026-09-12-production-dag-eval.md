# Production DAG benchmark execution implementation plan

> Execution: inline in the current task, as requested by the user. UI changes remain with the UI task. This plan covers phase 1 of the agreed V2.1.0 roadmap.

**Goal:** Run the pinned five-employee research sample through production workflow creation, work assignment, dependency propagation and durable Runtime execution.

**Architecture:** Keep LocalWeWorkApi authoritative for graph/work dependencies. Add an explicitly invoked Host workflow executor which starts only already-assigned eligible work, consults durable run state before advancing, and never grants delivery acceptance. The benchmark supplies task data and observes results; it does not manually order employees or copy upstream outputs.

**Tech Stack:** Node 22, existing WeWorkService, RuntimeManager, Pi RPC, node:test.

## Constraints

- Existing UI and unrelated model registry edits are owned by other tasks; do not modify them.
- Executor invocation is an explicitly authorized fixed-scope run. No auto-enable, four-mode permission claims, or new background daemon.
- Submission permits DAG stage progression under the existing contract; it never means human acceptance.
- A failed/cancelled/uncertain run cannot unlock dependencies or silently replay.
- Retain the first smoke and its evidence. New production-path evidence goes in separate directories.

## Task 1: Durable production workflow executor

Files: app-runtime/src/host/workflow-executor.js; app-runtime/test/workflow-executor.test.js.
Consumes: WeWorkService.api.snapshot(), startWorkflow(), completeCurrent(); WeWorkService.startRun(spec, runtime); RuntimeManager.get/start and active run map.
Produces: WorkflowExecutor.tick(teamId, workflowId), returning completed/blocked/running plus reasons and run references. tick calls are serialized per executor. Stable work-derived run IDs prevent replay on restart; a missing in-memory owner for a persisted nonterminal run is uncertain.

- [x] Test real file-backed service and fake deterministic Runtime: A produces a submitted output; B receives the exact production-copied document with source IDs. No approved review is added.
- [x] Test failed A leaves B blocked; rebuilding executor does not replay A.
- [x] Test successful run without matching submission does not progress.
- [x] Test durable succeeded A resumes progression after recreation without launching A again; no duplicate B on repeated tick.
- [x] Implement the executor against real assignment state, with identity checks before completing work.
- [x] Run node --test app-runtime/test/workflow-executor.test.js.

## Task 2: Production benchmark adapter

Files: evals/multiagentbench/run-production.mjs; README.md; RESULTS.md.
Consumes: original sample/provenance, production service and WorkflowExecutor.
Produces: saved real WorkflowTemplate, linked work IDs, real runs, document/submission records, final proposal and machine-readable checks.

- [x] Create five employee profiles and save one production workflow with explicit dependencies and selected inputBindings. Require stable stage output titles so production can select full documents.
- [x] Start production workflow once; attach original task and shared source registry to linked works before executor invocation. No manual upstream copy or employee-order loop.
- [x] Invoke executor ticks until done/blocked or bounded timeout; capture snapshot and reports in an isolated directory. Preserve model identity and full outputs.
- [x] Run one real sample; inspect all five linked work records, full upstream provenance, terminal runs, and unaccepted submissions.

## Task 3: Verification and handoff

- [x] Run new tests plus existing Pi/workflow tool tests; distinguish sandbox socket failures from application failures.
- [x] Record actual limits: no official judge, no UI launch yet, no automatic DAG generation or adaptive lifecycle implementation.
- [x] Provide UI task the real state contract and run artifact location; final response links evidence and states precisely what was verified.

Later roadmap phases remain: chat/attachments intake and adoption decision; approval/intervention closure; UI end-to-end; Adaptive/reuse/ARC sequences. They are not marked complete by this phase.

Execution result: phase 1 completed with one real production-path sample (5/5 nodes), source-provenance assertions and focused regressions. UI handoff records the selected-graph limitation and absence of a new Host endpoint. Subsequent roadmap phases remain pending.
