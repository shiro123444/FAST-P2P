# TUI Framework - P2P Layout Refresh

## Goal

Bring `example/p2p.ts` closer to the `opencode` TUI visual structure, with a reusable shell that keeps `home`, `dashboard`, and `/connect` in the same design language.

## Current Issues

1. `/connect` uses a separate page composition and breaks visual continuity with the home/dashboard views.
2. The current connect screen is only a stack of bordered boxes, without a clear primary work area or secondary sidebar.
3. Status, guidance, activity log, and quick actions are all rendered at the same visual weight.
4. There is no shared layout primitive for future animated sections or new route-specific panels.

## Reference Findings

- `opencode` session view uses a stable shell: top header, main workspace, optional side panel, bottom footer.
- `opencode` sidebars group related metadata into compact stacked blocks instead of wide equal-weight grids.
- `opencode` footers carry low-priority status and shortcuts, keeping the main pane focused on the active task.

## Fix Plan

### Phase 1: Shared P2P shell

- [x] Add a shared top bar, content frame, and bottom status rail
- [x] Introduce reusable panel helpers for cards, labels, and state rows
- [x] Add a light animation ticker for subtle motion and future extension

### Phase 2: Connect view rebuild

- [x] Replace the old 2x2 equal grid with sidebar + hero + activity layout
- [x] Elevate QR and connection state as the primary work area
- [x] Move support information into secondary cards

### Phase 3: Verify

- [x] Run package-level `bun typecheck`
- [x] Check narrow and wide terminal rendering assumptions

## Files to Modify

- `packages/tui-framework/example/p2p.ts`
- `packages/tui-framework/task_plan.md`
- `packages/tui-framework/findings.md`
- `packages/tui-framework/progress.md`

## Status

[COMPLETE] Layout refresh and verification
