# Unified Three.js WeWork Stage

Status: supporting spatial-design specification.

## Goal

Use one Three.js scene as sole owner of round-table geometry, camera pose, employee world positions, and top-down/eye-level transitions. Keep EmployeeBot as existing animated SVG DOM content and keep workspace panels as normal React DOM.

## Architecture

One persistent Three.js scene owns the table and camera state. Employees occupy fixed points around one world-space circular table. Camera mode changes between top-down and eye-level using a spherical orbit; selecting another employee changes camera azimuth instead of moving independent screen-space carousel items.

Each employee has a Three.js world anchor. After every camera update, anchors project through the active camera into stage pixel coordinates. A single DOM overlay renders `WeWorkEmployeeAvatar`, labels, status, and context indicators at those projected coordinates. This preserves SVG animation, hover gaze, accessibility, and crisp scaling without duplicating spatial calculations.

## Behavior

- Top-down: one circular white tabletop defined by restrained shadow; employees remain outside its edge. Only the hovered Employee enlarges. Clicking a selected Employee enters eye level.
- Transition: camera follows one spherical orbit from above table to a point above tabletop and facing table center. Table and employees remain fixed in world space.
- Eye-level: selected employee faces the camera across the table. Adjacent visible employees remain on the same table orbit. Selecting another employee changes azimuth continuously along the shortest coherent direction.
- Employees behind the camera are hidden; edge employees fade out.
- A debug mode control may exist during development but is not part of the production interface.
- Clicking selected eye-level employee opens existing session dialog.
- Reduced motion snaps camera and azimuth while preserving final geometry.

## Boundaries

- Three.js owns spatial geometry, camera movement, and projection only.
- EmployeeBot remains 2D SVG; no GLB, texture baking, or 3D character replacement.
- Team sidebar, input/output panels, dialogs, and controls remain React DOM.
- Existing WeWork state remains source of selected team, selected employee, and view mode.
- H frame uses upstream proportional local stroke width 10; no WeWork CSS override.

## Testing

- Unit-test cyclic selection, mode target poses, and projected anchor ordering.
- Component-test top-down hover, selected-employee entry, eye-level looping, and session opening.
- Playwright-check 1280x720 and 1440x900 for nonblank canvas, table framing, no overlap, and full workflow.
- Capture transition frames to verify no duplicate employees, jumps, or below-table camera view.
