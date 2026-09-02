# WeWork Design Documents

This directory is the design source for WeWork. It contains no UI implementation.

## Source of truth

- [`product/2026-08-19-wework-v2.md`](product/2026-08-19-wework-v2.md): current product definition, interaction model, domain boundaries, and delivery scope.

## Supporting documents

- [`product/2026-08-19-wework-overall-plan.md`](product/2026-08-19-wework-overall-plan.md): system architecture and phased delivery map.
- [`product/2026-08-21-employee-workflow-motion-feedback.md`](product/2026-08-21-employee-workflow-motion-feedback.md): approved task-drag and Employee workflow motion language.
- [`product/2026-08-25-workflow-dag-visual-design.md`](product/2026-08-25-workflow-dag-visual-design.md): alternative fixed-process team view using role-based DAGs.
- [`product/2026-09-02-wework-simplification-audit.md`](product/2026-09-02-wework-simplification-audit.md): evidence-backed simplification proposals and explicitly rejected candidates across the current WeWork codebase.
- [`superpowers/specs/2026-08-18-unified-three-wework-stage-design.md`](superpowers/specs/2026-08-18-unified-three-wework-stage-design.md): spatial and camera model for the round-table stage.

## Reading order

1. Read the V2 product design for user-facing behavior.
2. Read the overall plan for backend and runtime boundaries.
3. Use the motion and Three.js documents only when implementing those surfaces.

If a supporting document conflicts with the V2 product design, the V2 product design wins.
