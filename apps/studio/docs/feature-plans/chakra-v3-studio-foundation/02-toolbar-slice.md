# Task 02 — Toolbar proof slice

## Mission

Migrate the complete Toolbar interaction surface—semantic button wrapper, tooltip, and level dropdown—to Chakra v3 while preserving editor behavior and dense visual layout. Read the coordinator README before starting.

## Launch base and isolation

- Prerequisite: Task 01's PR is merged and reachable from refreshed `main`.
- Delivery: `default-branch-pr` intended for `main`.
- Base policy: `latest-default`; the coordinator records the exact post-merge commit as `<exact-launch-base>`.

```text
git worktree add E:/Adel/Documents/Orgs/mmx-studio-chakra-v3-toolbar-02 -b codex/chakra-v3-toolbar-02 <exact-launch-base>
cd E:/Adel/Documents/Orgs/mmx-studio-chakra-v3-toolbar-02
git status --short --branch
```

Start clean. Do not launch from the planning commit or an unmerged Task 01 tip.

## Context and owned scope

Primary files: `src/renderer/src/components/Toolbar.tsx`, `components/Tooltip.tsx`, `App.tsx`, a new `src/renderer/src/ui/editor/toolbar-button.tsx`, and `e2e/smoke.spec.ts`. A narrow Chakra Menu wrapper under `ui/primitives/` is allowed if it prevents compound-component boilerplate. Do not edit TitleBar menu implementations.

Toolbar commands come from `editor`/`useEditorSnapshot`; do not move state ownership or change command semantics. The existing `Tooltip` call sites use a `label` prop. The current root Radix Tooltip provider can be removed only after the migrated tooltip no longer needs it.

## Required work

1. Implement a compact semantic `ToolbarButton` over Chakra, covering icon-only, text, active, disabled, and destructive/primary Play states without leaking repeated style-prop bundles into the feature.
2. Reimplement the shared Tooltip used by Toolbar with Chakra's compound API and an explicit portal/positioner so content is not clipped by Dockview. Preserve child semantics and accessible labeling.
3. Replace Toolbar's Radix level dropdown with Chakra Menu composition. Preserve the `Level menu` accessible name, New/Open commands, keyboard navigation, focus return, and portal stacking.
4. Migrate Toolbar layout/styling to Chakra only where it adds semantic value. Preserve the centered level control, responsive zoom hiding, exact command calls, compact 36px bar, disabled states, active indicators, and Play/Stop behavior.
5. Remove the root Radix Tooltip provider from `App.tsx` if no remaining component requires it; do not remove package dependencies during this slice.
6. Extend Electron smoke coverage for a visible tooltip, keyboard-opened level menu, an active toggle, Play/Stop, and absence of page/console errors. Avoid triggering native file dialogs.

## Out of scope and contracts

Do not migrate TitleBar, Inspector, ContextMenu, other buttons, Dockview tabs, or the Pixi viewport. Do not remove Tailwind, `ui.ts`, or Radix packages. Preserve public accessible names used by current E2E tests and all keyboard shortcuts owned by the editor controller.

## Verification and delivery

Satisfy `AC-TOOLBAR` and `AC-OVERLAY`. Run:

```text
pnpm typecheck
pnpm build
pnpm e2e
```

Manually verify dark and light Toolbar states, tooltip/menu layering over Dockview, compact layout near the existing responsive breakpoint, keyboard focus return, grid/snap active styling, and Play/Stop. The PR is independently safe only when the entire Toolbar slice is complete; otherwise retain it for integration review.

Create 1–3 logical commits. Review the full diff from the exact launch base and report commits, changed paths, command results, interaction evidence, accessibility observations, remaining Radix usage, risks, and final status.
