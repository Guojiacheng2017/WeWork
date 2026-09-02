# DAG right workspace design QA

- Source visual truth: `/var/folders/9j/hzf588pj0kdbhflqpsbcq8dm0000gn/T/codex-clipboard-3f50727b-f45e-465a-ab54-e3fc2ee3d83f.png`
- Supporting layout reference: `/var/folders/9j/hzf588pj0kdbhflqpsbcq8dm0000gn/T/codex-clipboard-8765c59f-90a7-44bb-8785-68fb61baeaf2.png`
- Implementation screenshot: `/private/tmp/wework-dag-canvas-overlay-final.png`
- Combined comparison: `/private/tmp/wework-dag-right-split-comparison.png`
- Viewport: 1280 × 720 CSS px, desktop, device scale factor 1
- Pixel dimensions: source 2938 × 1514; implementation 1280 × 720. The comparison scales both proportionally and evaluates structure rather than pixel-identical responsive dimensions.
- State: CV team → workflow DAG → first node selected; node inspector and pending work both visible.

## Full-view comparison evidence

The implementation preserves the source product shell and makes the DAG canvas fill the complete workspace. The workflow title is a compact floating card at the canvas top-left. Pending work and node configuration are independent floating rounded panels above the canvas; either can close without reflowing or squeezing the other, and closing both exposes the full canvas.

## Focused region comparison evidence

The focused right region was inspected at native implementation resolution. Header hierarchy, close/add actions, form controls, task cards, border treatment, typography, and spacing use the existing WeWork design tokens. No new raster assets were required; all visible icons continue to use the project's icon library.

## Required fidelity surfaces

- Fonts and typography: existing font stack, weights, compact labels, and heading hierarchy preserved.
- Spacing and layout rhythm: 404px floating right rail; two equal flexible panels separated by a stable 12px gutter; canvas remains full-size underneath; independent overflow.
- Colors and visual tokens: existing slate/rose/sky semantic palette preserved.
- Image and asset fidelity: no referenced image assets are part of this UI region; existing avatar and icon components remain unchanged.
- Copy and content: `节点配置` and `待办公文与任务` retain their existing product copy and behaviors.

## Comparison history

1. Initial implementation: P2 — opening the inspector retained the old 300px overlay reservation, over-shrinking the canvas and clipping the left node.
2. Fix: removed the obsolete reserved-width fit calculation because the new right rail participates in layout.
3. User correction: the intended order is pending work above and node configuration below, and selecting a node must not squeeze the task list.
4. Fix: converted both regions to permanent rounded floating panels, reversed their order, kept both tracks stable, and added a 220ms opacity/translate/scale content transition with reduced-motion support.
5. Annotated correction: the apparent top bar should be canvas, the workflow title should be a compact floating card, both right panels must close independently, and the minimap must represent and control the viewport.
6. Fix: made canvas full-area, reduced the title to title-only, added independent panel close/reopen behavior, and implemented a scale-aware draggable/clickable minimap viewport.
7. Post-fix evidence: `/private/tmp/wework-dag-canvas-overlay-final.png`; browser checks confirm node close → tasks remain → clicking a node reopens configuration, with no console errors.

## Findings

No actionable P0/P1/P2 differences remain for the requested desktop split-panel behavior.

## Primary interactions tested

- Enter DAG view.
- Select a node and open node configuration.
- Keep pending tasks visible while configuration is open.
- Close/open behavior remains available for both sections.
- Browser console checked: no warnings or errors.

## Follow-up polish

- P3: a draggable gutter could be added later if users need custom height allocation; it is not required by the supplied reference.

final result: passed

---

# WeWork settings shell design QA

- Primary source: `/var/folders/9j/hzf588pj0kdbhflqpsbcq8dm0000gn/T/TemporaryItems/NSIRD_screencaptureui_uxfsT1/Screenshot 2026-08-28 at 17.00.05.png`
- Supporting account-menu sources: `Screenshot 2026-08-28 at 16.57.52.png` and `Screenshot 2026-08-28 at 16.59.51.png`
- Implementation screenshot: `/private/tmp/wework-settings-final.png`
- State: WeWork entered → local-user menu → Settings → General / Execution tabs.

## Findings

- The account area is now a compact launcher rather than the settings surface itself.
- The settings surface is a dedicated desktop modal with a fixed category rail and independently scrolling content pane.
- Existing Harness and model configuration remains intact under `执行器与模型`; General, workspace/security, and About are separate categories.
- Search filters the visible category list, the restore-team switch is interactive and persisted, and category navigation is keyboard-accessible native button UI.
- The implementation follows the reference hierarchy while retaining WeWork typography, slate palette, spacing, radius, and local-first terminology.
- Browser interaction checks found no console warnings or errors.

No actionable P0/P1/P2 differences remain for the requested settings information architecture.

final result: passed

---

# Landing → sidebar brand handoff design QA

- Source landing reference: `/var/folders/9j/hzf588pj0kdbhflqpsbcq8dm0000gn/T/TemporaryItems/NSIRD_screencaptureui_1EHCkI/Screenshot 2026-08-27 at 15.21.24.png`
- Source sidebar reference: `/var/folders/9j/hzf588pj0kdbhflqpsbcq8dm0000gn/T/TemporaryItems/NSIRD_screencaptureui_aPDR2o/Screenshot 2026-08-27 at 15.21.02.png`
- Implementation screenshot: `/private/tmp/wework-brand-handoff-final.png`
- Viewport: 1280 × 720 CSS px, desktop.
- Interaction: Landing settles on wework + WeWork lockup → user selects `进入 WeWork` → the complete lockup moves and resizes into the sidebar header.

## Findings

- The wework mark, WeWork wordmark, version, and supporting line now move as one brand unit.
- The destination uses the same wework vector and the same WeWork/version/sidebar copy, avoiding a visible asset swap.
- The WeWork workspace renders beneath the transparent outgoing landing layer during the flight.
- The source supporting line crossfades from `打开你的助手团队` to the destination copy `助手协同平台`.
- Reduced-motion users receive the same semantic handoff without the long spatial transition.
- Browser console contains no warnings or errors.

No actionable P0/P1/P2 mismatch remains for the requested desktop handoff.

final result: passed
