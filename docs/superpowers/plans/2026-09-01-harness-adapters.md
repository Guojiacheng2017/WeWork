# Harness adapters and sdh integration

Scope: shared main explicitly authorized; preserve concurrent WeWork core changes. Only the two existing sessions participate.

## Requirements

- WeWork owns collaboration, authority, task state and durable messages. Employee Harness owns its agent loop, tools, native sessions and context.
- External Pi/Claude/Codex/Gemini availability must come from this device, never developer-machine assumptions or implicit SDK fallback.
- Bundle sdh deliberately; model endpoint is not a Harness endpoint. Runtime data lives outside installed resources.
- Cancellation acknowledgement means executor stopped and terminal state persisted. Never transfer ownership merely after sending an abort.
- Checkpoints cannot cross employee, Harness or execution-profile boundaries.
- Preserve web UI; native features report unavailable honestly in browser mode.

## Implementation sequence

1. RuntimeManager: regression tests for delayed cancellation, timeout, persistence failure, checkpoint provenance; implement cancelAndWait and recovery isolation.
2. sdh: tests for session ID validation, atomic persistence, tracked tasks, live-instance reuse, deletion; repair context budgeting without orphan tool messages.
3. Adapter contract: executeHarness(spec,{signal,emit,tools}); explicit registry, descriptor readiness, native executable probes and bundled sdh transport. No arbitrary shell commands.
4. Desktop: package sdh code/dependencies/skills, inject writable data/workspace paths, supervise shutdown.
5. Integrate the other session's CollaborationCoordinator and group delivery UI; verify failures, retries, handoffs, restarts and two-Team isolation.
6. Run focused tests, complete test suites, production build and packaged smoke tests. Report platform/provider gaps accurately. Commit WeWork and sdh separately, with path-scoped staging.

## File ownership

Other session owns src/local, domain/wework.ts, host/wework-service.js, wework-tools.js, host/collaboration-coordinator.js and host/server.js. This session owns adapters, runtime-manager, host-main, Desktop, renderer bridge/store/components and sdh. Coordinate new endpoints before editing.
