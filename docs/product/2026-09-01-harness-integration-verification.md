# Harness integration milestone — 2026-09-01

## Implemented boundary

Two existing sessions worked in shared main. WeWork core owns durable public messages, delivery identity, reviewed handoffs and task authority. The adapter session owns employee execution, native sessions, Desktop packaging and renderer integration. No isolated rebuild branch was merged.

Bundled sdh runs a packaged Node child with IPC tool calls to the authoritative WeWork service. Its model endpoint is not a separately deployed Harness service. Native transcripts persist outside installed resources. Cancellation waits for child shutdown, outstanding Host tool calls and durable terminal state before ownership can move.

External Pi/Claude/Codex/Gemini are discovered on the actual device. Installation differs from execution readiness; these execution adapters remain unavailable, without Pi SDK fallback. Browser mode stores public messages without deferred model runs or fake native capabilities.

Assigned skills load real workspace/bundled SKILL.md content with path/size checks. Labels alone are not loaded capabilities. sdh request context retains complete recent turns/tool pairs and preserves transcripts on disk; oversized latest turns fail explicitly.

## Verification

- WeWork: 36 renderer/service + 46 Runtime + 4 Desktop supervisor tests = 86 passed.
- Standalone sdh session/context: 9 passed; commit 41a616d.
- Production frontend and bundled Host/sdh runner builds passed.
- Built-runner local model fixture passed: model selection, WeWork tool round-trip, native resume and profile isolation.
- Coordinator integration covers public delivery, cancellation/handoff and private-history isolation.
- Chrome localhost:4174: Enter sends public messages, refresh preserves them, private seeded histories are absent, and queued delivery cancellation renders cancelled. Console check returned no warnings/errors.
- Model tests use local fixtures; no live provider or external CLI execution is claimed.

## Remaining limits

- External CLI execution/session/tool adapters and real-provider/platform tests remain pending.
- Skill upload/assignment UX, supporting resources/scripts and archived-context retrieval tools are incomplete.
- No fresh packaged .app launch or Windows/Linux native end-to-end test in this milestone.
- Bundled adapter rejects SSH execution; existing platform directory/vault gaps remain.
- Legacy CheckpointStore filename sanitization can collide; standalone sdh stream timeout/listener cleanup needs review.
- npm audit reports two high findings involving Electron/extract-zip; no forced major upgrade was made.
- Build warnings remain for frontend chunk size and source-only import.meta fallback in the CJS Host bundle. Packaged runner-path injection was tested successfully.

This is the bundled-sdh collaboration milestone, not completion of every Harness or historical UI request.
