# MultiAgentBench → WeWork integration smoke

This is an **adapted integration smoke**, not an official MultiAgentBench score or a completed production DAG implementation.

## Input and scope

One original research task and its five agent profiles are pinned in `samples/research-001.json`. `samples/provenance.json` records upstream revision, source line, SHA-256 and adaptations; `UPSTREAM-LICENSE` retains the repository license.

The five roles execute a fixed dependency chain: source review → proposals → criticism → refinement → five-question synthesis. All original profiles and the full original task are retained. Literature review is restricted to the supplied material; external novelty claims and experimental results are not verified. The official MARBLE environment, coordination protocol and judge are not used.

## Run

From the repository's skills directory, with Node 22.22+ and an installed, authenticated Pi:

```sh
node wework/evals/multiagentbench/run-smoke.mjs
```

An optional first argument chooses a new output directory. Every invocation uses isolated WeWork business state and fresh employees/sessions. It uses Pi's configured default model and authentication without copying credentials. The exact resolved model remains recorded in native session metadata. Runs consume real model usage; each stage has a three-minute timeout.

The runner invokes existing WeWorkService preparation, RuntimeManager persistence, Pi RPC and the real run-bound WeWork context/output/submission tools. Built-in Pi tools and ambient extensions/skills/context discovery are disabled. The explicitly loaded WeWork extension exposes only the smoke's allowlisted tools. Execution scope is preauthorized for this test; deliverables remain submitted, not business-approved. Adaptive history is not involved. This does not implement or validate the proposed four-mode permission system.

## Evidence

Each run retains:

- `dag.json`: explicit employee/work dependencies, scheduled by this smoke runner (not the production DAG scheduler).
- `wework.json`: persisted team, employees, inputs, output revisions, submissions and audit records.
- `runtime/`: durable runs and checkpoints.
- `native-sessions/`: native model session metadata and transcripts, local-only by default.
- `events.jsonl`, `tool-calls.json`: execution events and tool outcomes.
- `stage-1.md` through `stage-5.md`: actual submitted contributions.
- `report.json`: structural checks and outcome, including failed runs.

Passing requires all five employees to execute successfully, persisted submitted documents to survive re-opening the service, upstream stages to finish before downstream execution, and the final output to contain all five requested headings. These checks do not establish research correctness, superiority, official benchmark performance, production DAG readiness, or human approval.

## Next evaluations

Use the same evidence format for production scheduler integration; add semantic judging separately from plumbing checks. Larger benchmark comparisons, long-horizon business reports and real video-writing deliverables are distinct subsequent steps. Keep histories/configuration fixed for baseline comparisons; test Adaptive and cache lifecycle in separate ordered sequences.

The source-attribution revision provides the original profiles in a shared registry keyed by agent, labels upstream documents with their author, and requires paginated document reads. This fixes the initial smoke adapter's ambiguous profile context, not a production WeWork source-provenance feature.

To independently verify a completed run:

```sh
node wework/evals/multiagentbench/verify-run.mjs /absolute/path/to/run
```

The verifier checks full exported document equality, upstream copies, durable run state, model identity and token usage, and records whether each employee read the full shared source registry. Total tokens include cached input as reported by Pi and are not a monetary cost estimate.

## Production workflow path (phase 1)

```sh
node wework/evals/multiagentbench/run-production.mjs
```

This adapter saves a real `WorkflowTemplate`, invokes `startWorkflow`, and runs the explicitly invoked Host `WorkflowExecutor`. The original source task and role registry are attached before execution. Unlike the first smoke, the adapter never manually copies upstream outputs or runs employees in a fixed loop: the production work assignment and `inputBindings` mechanism chooses eligible work and propagates full documents with source IDs. Stable required output titles make selection deterministic.

The Host executor uses durable work-derived run identities. Only a succeeded run with its own current submission can call production stage completion. Failures, cancellation, missing submission and interrupted runs block automatic advancement/replay. Recreating the executor/Runtime can reconcile a durable succeeded run without repeating it. The executor is opt-in, not installed as an unconditional background scheduler and not yet exposed as a new UI/Host endpoint.

Current limitation: the selected workflow must match the explicit target. Existing completion reconciliation is selected-graph scoped, so this executor refuses to advance another graph. Concurrent multi-graph/background view switching requires a separate service change before UI end-to-end claims. The exported method is `WorkflowExecutor.tick(teamId, workflowId)`; callers must supply the existing authoritative service/Runtime and authorize the workflow scope. This is not a four-mode permission implementation.

Production outputs are in `runs/production-*`: `status.json`, actual `dag.json`, `wework.json`, Runtime/native traces, five submitted Markdown artifacts and `report.json`. Completion checks re-open persisted business state, compare full upstream content and source identities, and distinguish stage completion from acceptance. The earlier `verify-run.mjs` expects the original smoke schema and must not be used for these production reports.

### Follow-up: graph selection independence

The later graph-scoping fix removes the selected-graph restriction above: completion/cancellation/return now resolve the work's owning workflow, and WorkflowExecutor reads its explicit target without changing UI selection. Switching-view regressions cover all three operations. This does not activate a background scheduler or replace the renderer's existing LocalRunScheduler; that migration is tracked in `docs/product/2026-09-12-dag-ui-runtime-contract.md`.


`run-production.mjs` now uses the production Host background supervisor. It prepares source documents before explicit enrollment, starts through `WeWorkService.call('startWorkflow', ...)`, and only polls execution status. It does not drive progression. See RESULTS.md for the real background-run evidence and the UI/official-scoring limits.
