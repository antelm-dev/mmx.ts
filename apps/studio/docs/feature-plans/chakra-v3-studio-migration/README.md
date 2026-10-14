# Chakra v3 Studio migration (milestone 2)

## Goal and milestone

Finish moving the Studio renderer chrome from Tailwind class strings + Radix primitives to the Chakra v3 system established by milestone 1 (`../chakra-v3-studio-foundation`), then remove Radix, `ui.ts` and Tailwind. Every task is a complete, user-visible slice that preserves behavior, accessible names, keyboard handling, the compact density, the `data-theme` bootstrap and the Dockview/Pixi/Monaco integration.

Source base: the `main` commit that contains Task 02 (Toolbar slice). That is `8421beb` (PR #42). Planning ref: `codex/plan-chakra-v3-studio-migration`.

## Repository and shared contract

- Repository: `E:/Adel/Documents/Orgs/mmx-studio`, default branch `main`, remote `origin`.
- Chakra system: `src/renderer/src/ui/system.ts` (module-level singleton, `preflight: false`, `studio.*` semantic tokens aliasing the `--studio-*` CSS variables). Wrappers live under `src/renderer/src/ui/` (`primitives/` for thin Chakra compositions, `editor/` for Studio-semantic components). Task 02 adds `ui/editor/toolbar-button.tsx` and a `ui/primitives/` menu/tooltip wrapper; reuse them, do not fork them.
- Chakra imports outside `src/renderer/src/ui/` stay exceptional. Feature code consumes wrappers.
- Styling source of truth during the milestone: `ui.ts` strings are replaced one consumer at a time. A wrapper may keep a Tailwind class internally only when a Chakra prop has no equivalent; it is removed in Task 07.
- Workers never remove packages, `ui.ts` exports or Tailwind. Dead code is removed by Task 07 so parallel branches never conflict on `package.json` or `ui.ts`.
- Keep every accessible name and `data-testid` that `e2e/*.spec.ts` uses. Grep the specs before renaming anything.
- Portaled overlays (menus, selects, tooltips) must use Chakra's `Portal` + `Positioner` so Dockview never clips them, and must not steal focus from Monaco or the Pixi canvas on close (`onCloseAutoFocus`-equivalent: Chakra `Menu.Root` `onExitComplete` / `closeOnSelect` + explicit `returnFocus`).
- Do not touch `src/renderer/src/app/theme.ts`, `styles.css` palette blocks, Dockview CSS, Monaco or Pixi setup except where a task says so.

## Acceptance criteria

- **AC-MENUS:** All TitleBar dropdown menus render through the shared Chakra Menu wrapper with the same labels, shortcuts, separators, disabled items and `onSelect` commands; keyboard open/navigate/close works; no Radix dropdown import remains.
- **AC-CONTEXT:** Scene list rows and the viewport open Chakra context menus on right-click with identical items; focus does not jump after close; no Radix context-menu import remains.
- **AC-FORMS:** Inspector and Room panel fields, checkboxes and selects are Chakra-backed Studio wrappers with unchanged labels, invalid state, numeric parsing and commit timing; no Radix checkbox/select import remains.
- **AC-PANELS:** Panel shells, section titles, list rows and footer action buttons use Studio wrappers; `ui.ts` has no consumer outside `src/renderer/src/ui/`.
- **AC-CLEANUP:** Radix packages, `ui.ts`, Tailwind (`@import "tailwindcss"`, its PostCSS/Vite wiring and `@theme` blocks) are gone; the `--studio-*` variables are declared once and still drive Dockview; dark/light toggle and reload behave as before.
- **AC-QUALITY:** `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e` pass at each merged tip and at the final candidate.

## Tasks and execution waves

| Task | Outcome | Depends on | Branch | Delivery | Base policy |
| --- | --- | --- | --- | --- | --- |
| 03 | TitleBar dropdown menus on the shared Chakra Menu wrapper | 02 merged | `codex/chakra-v3-menus-03` | `default-branch-pr` | `latest-default` |
| 04 | Scene and viewport context menus on Chakra Menu | 02 merged | `codex/chakra-v3-context-menus-04` | `default-branch-pr` | `latest-default` |
| 05 | Inspector + Room panel form controls (Field, Input, Checkbox, Select) | 02 merged | `codex/chakra-v3-forms-05` | `default-branch-pr` | `latest-default` |
| 06 | Panel shells, list rows, section titles, action buttons, toasts, PlaytestDebugger chrome | 04, 05 merged | `codex/chakra-v3-panels-06` | `default-branch-pr` | `latest-default` |
| 07 | Remove Radix, `ui.ts`, Tailwind; token ownership | 03, 06 merged | `codex/chakra-v3-cleanup-07` | `default-branch-pr` | `latest-default` |

Wave 1 runs 03, 04 and 05 in parallel: their owned files are disjoint (`TitleBar.tsx` / `ScenePanel.tsx` + `Viewport.tsx` / `Inspector.tsx` + `RoomPanel.tsx`) and each adds its own new wrapper files. Wave 2 is Task 06 after 04 and 05 merge (it edits `ScenePanel.tsx` list rows and the Inspector footer). Wave 3 is Task 07 alone, launched from the `main` tip that contains 03–06. Each worker launches from the refreshed `main` tip the coordinator records as its immutable launch base.

Planning these destinations does not authorize pushing or opening/merging PRs. A later invocation should explicitly say: **Review completed tasks and open or merge eligible PRs.**

## Checks and E2E gate

Workers run the checks listed in their prompts. At each accepted candidate tip and at the final tip the coordinator runs:

```text
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

Critical E2E scenarios (extend `e2e/smoke.spec.ts` or add one spec per task):

1. TitleBar menus open by pointer and keyboard, show shortcuts, run a command (theme toggle), and close without leaving focus on `body`.
2. Right-click on a scene row opens the context menu; `Duplicate` adds an object; Escape closes and the row keeps focus.
3. Inspector numeric field commits on Enter/blur, rejects invalid input with the invalid style, checkbox and select change the object and undo restores it.
4. After cleanup, dark/light toggle still restyles Toolbar, panels, Dockview tabs and Monaco, and persists across reload; the production bundle contains no Tailwind runtime CSS and no Radix module.

The coordinator owns conflicts in `package.json`, `pnpm-lock.yaml`, `ui/` wrapper files and aggregate E2E behavior. Do not resolve a conflict by dropping a wrapper or a lockfile change. Remove worker worktrees only after their commits are reachable from `main`.

## Worker evidence

Each worker reports its exact launch base, branch/worktree path, commits, changed paths, targeted command results with counts, manual/E2E evidence, remaining Radix / `ui.ts` usage in its owned files, unresolved risks, and final `git status --short --branch`. Use 1–3 logical commits and review the full diff against the launch base.

## Deferred backlog

- `system` color-mode preference with OS synchronization.
- Visual-regression coverage (Playwright screenshots per theme).
- Extract `src/renderer/src/ui/` into a packaged `@mmx/ui` once a second consumer exists.
- Migrate Dockview tab/header styling to Chakra tokens beyond the CSS-variable bridge.

```yaml
review_contract:
  milestone: chakra-v3-studio-migration
  planning_ref: codex/plan-chakra-v3-studio-migration
  source_base: "8421beb812dc69899bd4ab11298b7fc752674d03"
  default_branch: main
  tasks:
    - id: "03"
      branch: codex/chakra-v3-menus-03
      depends_on: ["02"]
      acceptance: [AC-MENUS]
      checks: ["pnpm typecheck", "pnpm build", "pnpm e2e"]
      delivery: default-branch-pr
      base_policy: latest-default
    - id: "04"
      branch: codex/chakra-v3-context-menus-04
      depends_on: ["02"]
      acceptance: [AC-CONTEXT]
      checks: ["pnpm typecheck", "pnpm build", "pnpm e2e"]
      delivery: default-branch-pr
      base_policy: latest-default
    - id: "05"
      branch: codex/chakra-v3-forms-05
      depends_on: ["02"]
      acceptance: [AC-FORMS]
      checks: ["pnpm typecheck", "pnpm test", "pnpm build", "pnpm e2e"]
      delivery: default-branch-pr
      base_policy: latest-default
    - id: "06"
      branch: codex/chakra-v3-panels-06
      depends_on: ["04", "05"]
      acceptance: [AC-PANELS]
      checks: ["pnpm typecheck", "pnpm build", "pnpm e2e"]
      delivery: default-branch-pr
      base_policy: latest-default
    - id: "07"
      branch: codex/chakra-v3-cleanup-07
      depends_on: ["03", "06"]
      acceptance: [AC-CLEANUP]
      checks: ["pnpm install --frozen-lockfile", "pnpm typecheck", "pnpm test", "pnpm build", "pnpm e2e"]
      delivery: default-branch-pr
      base_policy: latest-default
  integration_checks: ["pnpm typecheck", "pnpm test", "pnpm build", "pnpm e2e"]
  e2e_scenarios:
    - "TitleBar menus open by pointer and keyboard, run a command, and return focus"
    - "Scene row context menu duplicates an object and closes on Escape"
    - "Inspector field, checkbox and select commit, validate and undo"
    - "After cleanup, theme toggle and reload still restyle Chakra, Dockview and Monaco; no Tailwind/Radix in the bundle"
  deferred:
    - "system color mode + OS sync"
    - "visual regression screenshots"
    - "@mmx/ui package extraction"
    - "Dockview theming beyond CSS-variable bridge"
```
