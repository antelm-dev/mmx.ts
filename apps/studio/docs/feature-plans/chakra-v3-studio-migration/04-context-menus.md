# Task 04 — Scene and viewport context menus

## Mission

Replace the Radix context menu in `src/renderer/src/components/ScenePanel.tsx` (`@radix-ui/react-context-menu`) and the hand-positioned context menu in `Viewport.tsx` (plain elements styled with `menu` / `ctxItemCls`) with the Chakra Menu wrapper's context-trigger mode. Read the coordinator README before starting.

## Launch base and isolation

- Prerequisite: Task 02 merged and reachable from refreshed `main`.
- Delivery: `default-branch-pr` to `main`. Base policy: `latest-default`; the coordinator records `<exact-launch-base>`.

```text
git worktree add E:/Adel/Documents/Orgs/mmx-studio-chakra-v3-context-menus-04 -b codex/chakra-v3-context-menus-04 <exact-launch-base>
cd E:/Adel/Documents/Orgs/mmx-studio-chakra-v3-context-menus-04
git status --short --branch
```

## Context and owned scope

Owned files: `ScenePanel.tsx` (context menu part only; list rows belong to Task 06), `Viewport.tsx` (context menu part only; Pixi mount and pointer handling stay as is), the shared menu wrapper under `ui/primitives/` (add a context-trigger variant), and a new `e2e/context-menu.spec.ts`. The current Scene menu prevents focus return on close (`onCloseAutoFocus={(e) => e.preventDefault()}`) so the Pixi canvas keeps keyboard shortcuts; the viewport menu is opened from a Pixi pointer event at screen coordinates.

## Required work

1. Add a context-trigger composition to the menu wrapper (`Menu.ContextTrigger` for DOM rows; a controlled open-at-point mode for the viewport, driven by `anchorPoint`/`positioning` from the Pixi event). Keep it portaled and positioned above Dockview.
2. Migrate the Scene row menu: same items (focus, duplicate, delete, …), same `editor.*` calls, same disabled logic. On close, focus must not move to `body` or steal from the canvas; verify the editor keyboard shortcuts still fire after closing.
3. Migrate the viewport menu: open at the pointer position from the existing Pixi handler, close on outside click/Escape/selection, same items and commands.
4. E2E: right-click a scene row, pick `Duplicate`, assert the object count grows; open and Escape, assert the row still has focus and a keyboard shortcut (e.g. Delete) still reaches the editor. Open the viewport menu by right-clicking the canvas and assert it is visible and closes on Escape.

## Out of scope and contracts

Do not restyle rows, headings or the panel shell (Task 06). Do not touch TitleBar or Toolbar menus. Do not remove the Radix package or `ui.ts` exports (Task 07). Keep the viewport pointer-to-world mapping untouched.

## Verification and delivery

Satisfy `AC-CONTEXT`. Run `pnpm typecheck`, `pnpm build`, `pnpm e2e`. Manually verify both menus in dark and light, near window edges, and that the canvas keeps receiving keys after a menu closes.

Create 1–3 logical commits. Report commits, changed paths, command results, focus evidence, remaining Radix usage in owned files (must be none), risks, and final `git status --short --branch`.
