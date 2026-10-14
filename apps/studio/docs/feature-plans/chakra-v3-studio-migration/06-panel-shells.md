# Task 06 — Panel shells, list rows and remaining chrome

## Mission

Replace the last `ui.ts` consumers outside `src/renderer/src/ui/`: panel shells (`panel`, `scroll`), section titles, list rows (`itemCls`), footer actions, toasts and the PlaytestDebugger/Viewport chrome. After this task `ui.ts` has no importer outside `ui/`. Read the coordinator README before starting.

## Launch base and isolation

- Prerequisite: Tasks 04 and 05 merged and reachable from refreshed `main`.
- Delivery: `default-branch-pr` to `main`. Base policy: `latest-default`; the coordinator records `<exact-launch-base>`.

```text
git worktree add E:/Adel/Documents/Orgs/mmx-studio-chakra-v3-panels-06 -b codex/chakra-v3-panels-06 <exact-launch-base>
cd E:/Adel/Documents/Orgs/mmx-studio-chakra-v3-panels-06
git status --short --branch
```

## Context and owned scope

Owned files: `ScenePanel.tsx` (rows and shell), `PalettePanel.tsx`, `AssetsPanel.tsx`, `ProblemsPanel.tsx`, `SelectionPanel.tsx`, `JsonPanel.tsx`, `PlaytestDebugger.tsx`, `Toasts.tsx`, `SpritePreview.tsx`, `Viewport.tsx` (overlay chrome only), new `ui/editor/panel.tsx` (`Panel`, `PanelScroll`, `SectionTitle` if Task 05 did not already export one — reuse it if it exists) and `ui/editor/list-row.tsx`. Palette and Scene rows are 38px, keyboard-selectable, show a hover-revealed add icon, and the active row uses the accent tint.

## Required work

1. `Panel` / `PanelScroll` wrappers (surface background, column flex, scrolling child) replacing `panel` / `scroll` in every panel. Dockview panel props and `data-testid`s stay.
2. `ListRow` wrapper replacing `itemCls` in Scene and Palette: `active`, hover reveal slot, keyboard focus ring, same height and horizontal inset. Scene row drag/selection handlers pass through unchanged.
3. Replace remaining `btnCls`, `actionBtn`, `sectionTitle` consumers in these files with the wrappers from Tasks 02 and 05.
4. Toasts: Chakra `Toaster`/`toast` only if it drops code; otherwise keep the store-driven list and restyle it with tokens. Keep the existing `addToast` API used by `main.tsx`.
5. PlaytestDebugger and Viewport overlays: tokens and wrappers for buttons/labels; do not change the Pixi canvas element, its sizing logic or the debugger data flow.
6. E2E: palette row selection, scene row keyboard selection and active styling, a toast appears after an action that already emits one, PlaytestDebugger opens and closes in Play.

## Out of scope and contracts

Do not touch TitleBar, Toolbar, Inspector or RoomPanel internals beyond imports. Do not delete `ui.ts` or packages (Task 07). Keep every selector the E2E suite uses (`grep -rn "getBy\|locator(" e2e/`).

## Verification and delivery

Satisfy `AC-PANELS`. Run `pnpm typecheck`, `pnpm build`, `pnpm e2e`, then `grep -rn "from \"../ui.js\"\|from \"./ui.js\"" src/renderer/src --include=*.tsx` must list nothing outside `src/renderer/src/ui/`. Manually verify both themes, scroll behavior with long lists, and Dockview resize.

Create 1–3 logical commits. Report commits, changed paths, command results, the grep result, risks, and final `git status --short --branch`.
