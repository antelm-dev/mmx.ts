# Task 03 — TitleBar menus on the shared Chakra Menu

## Mission

Move every TitleBar dropdown (`src/renderer/src/components/TitleBar.tsx`, Radix `@radix-ui/react-dropdown-menu`) to the Chakra Menu wrapper that Task 02 introduced under `src/renderer/src/ui/primitives/`. Read the coordinator README before starting.

## Launch base and isolation

- Prerequisite: Task 02 merged and reachable from refreshed `main`.
- Delivery: `default-branch-pr` to `main`. Base policy: `latest-default`; the coordinator records `<exact-launch-base>`.

```text
git worktree add E:/Adel/Documents/Orgs/mmx-studio-chakra-v3-menus-03 -b codex/chakra-v3-menus-03 <exact-launch-base>
cd E:/Adel/Documents/Orgs/mmx-studio-chakra-v3-menus-03
git status --short --branch
```

## Context and owned scope

Owned files: `TitleBar.tsx`, the existing menu wrapper in `ui/primitives/` (extend, don't fork), and `e2e/smoke.spec.ts` or a new `e2e/title-bar.spec.ts`. TitleBar uses `ctxItemCls`, `menu`, `menuSep`, `menuLabel` and `menuShortcut` from `ui.ts` (about 22 items, 8 separators, 7 labels, 12 shortcuts). The Electron drag region and window controls in TitleBar must keep working; do not change `-webkit-app-region` handling.

## Required work

1. Extend the Task 02 menu wrapper with what TitleBar needs and Toolbar did not: `Label`, `Separator`, right-aligned shortcut text, disabled items, checked/radio items if present. Keep it a thin composition over `Menu.Root/Trigger/Positioner/Content/Item` with the `studio.*` tokens; no new style-prop bundles in TitleBar.
2. Replace each Radix `DropdownMenu.*` in TitleBar with the wrapper. Preserve labels, shortcuts, order, disabled logic and the exact `editor.*` commands each `onSelect` calls.
3. Keep the menubar keyboard contract: a trigger opens with Enter/Space/ArrowDown, items navigate with arrows, Escape closes and returns focus to the trigger. Hovering between adjacent open menus may stay as it is today (document the current behavior and keep it).
4. Overlays go through `Portal` + `Positioner` so they render above Dockview.
5. Add E2E coverage: open a menu by pointer and by keyboard, read a shortcut, run a non-dialog command (theme toggle or similar), verify the menu closed and focus returned to the trigger, and no page/console errors. Avoid native dialogs (Open/Save/Import).

## Out of scope and contracts

Do not edit Toolbar, Inspector, ScenePanel, Viewport. Do not remove `@radix-ui/react-dropdown-menu` from `package.json` or delete `ui.ts` exports: Task 07 does. Do not change menu contents or add commands.

## Verification and delivery

Satisfy `AC-MENUS`. Run `pnpm typecheck`, `pnpm build`, `pnpm e2e`. Manually verify dark and light menus, layering over Dockview panels, long menus near the window bottom, and the Electron window drag region.

Create 1–3 logical commits. Report commits, changed paths, command results, keyboard evidence, remaining Radix usage in TitleBar (must be none), risks, and final `git status --short --branch`.
