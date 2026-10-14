# Chakra v3 Studio foundation

## Goal and milestone

Establish an Electron-safe Chakra UI v3 foundation in the renderer and prove it with one complete, user-visible Toolbar migration. The milestone must preserve the existing dark/light palette, Dockview/Pixi behavior, editor commands, compact density, and startup behavior.

This is intentionally not the complete Studio refactor. The source base is `5171810c528ab2ba57e26588a6c7a022502e671f` on `main`; the planning ref is `codex/plan-chakra-v3-studio-foundation`. Workers must receive this README and their task prompt directly, or be given this readable planning ref and exact plan path. Do not assume these files exist on a worker branch created from the source base.

## Repository and shared contract

- Repository: `E:/Adel/Documents/Orgs/mmx-studio`
- Remote/default branch: `origin`, `main`
- Intended integration branch: `codex/integrate-chakra-v3-studio-foundation`
- UI entry: `src/renderer/src/main.tsx`; current theme bootstrap: `src/renderer/src/app/theme.ts` and `styles.css`.
- Use a module-level Chakra system singleton. Never construct the system during React rendering.
- Keep Tailwind and the existing `--studio-*` CSS variables during this milestone. Chakra semantic tokens should alias those variables so Dockview and migrated Chakra UI share the same palette without duplicating colors.
- Do not adopt `next-themes`. Preserve the synchronous, localStorage-backed Electron theme bootstrap and its `data-theme` contract.
- Do not copy broad global pointer-event or user-select rules from `coll-front`; Pixi, Dockview, Monaco, and Electron drag regions must remain interactive.
- Keep Chakra package versions mutually compatible; `@chakra-ui/react` and `@chakra-ui/cli` must use the same version line. Add Emotion, but do not add charts or unrelated UI dependencies.
- Chakra imports outside `src/renderer/src/ui/` should be exceptional. Toolbar feature code should consume Studio wrappers where a stable semantic component exists.

## Acceptance criteria

- **AC-FOUNDATION:** The renderer is wrapped in one static Chakra provider, type generation is available, build output works under the existing `file://` Electron pipeline, and the untouched editor shell remains visually and behaviorally equivalent.
- **AC-THEME:** Existing dark/light selection still applies before React renders, persists across reload, updates Monaco and Dockview, and supplies the migrated Chakra controls through semantic tokens.
- **AC-TOOLBAR:** Undo/redo, tool selection, grid/snap, zoom, level menu, and Play/Stop retain accessible names, disabled/active states, keyboard behavior, and compact layout.
- **AC-OVERLAY:** Toolbar tooltips and the level dropdown render above Dockview without clipping, remain keyboard accessible, close correctly, and introduce no page or console errors.
- **AC-QUALITY:** Typecheck, unit tests, production build, and Electron smoke E2E pass at the integrated candidate tip.

## Tasks and execution waves

| Task | Outcome | Depends on | Branch | Delivery | Base policy |
| --- | --- | --- | --- | --- | --- |
| 01 | Static Chakra system, provider, semantic token bridge, and typegen | none | `codex/chakra-v3-foundation-01` | `default-branch-pr` to `main` | `latest-default` |
| 02 | Toolbar button, tooltip, and menu vertical slice | 01 merged to `main` | `codex/chakra-v3-toolbar-02` | `default-branch-pr` to `main` | `latest-default` |

Wave 1 contains Task 01. It may be reviewed and merged independently because it preserves the current UI and creates no incomplete user-facing contract. Wave 2 starts only after Task 01 is merged and the coordinator refreshes `main`; record that exact commit as Task 02's immutable launch base. Task 02 is independently deployable only as a complete Toolbar slice—do not merge a partial menu/tooltip conversion.

Planning these destinations does not authorize pushing or opening/merging PRs. A later invocation should explicitly say: **Review completed tasks and open or merge eligible PRs.**

## Checks and E2E gate

Workers run the targeted checks in their prompts. At the accepted candidate tip, the coordinator runs:

```text
pnpm typecheck
pnpm test
pnpm build
pnpm e2e
```

Critical E2E scenarios:

1. Studio boots in Electron with the Toolbar and viewport visible and no page, console, or failed-request errors.
2. Dark/light mode toggles from the title bar, updates Chakra Toolbar controls plus Dockview/Monaco, and survives an application reload.
3. Keyboard and pointer users can open/close the level menu and see a Toolbar tooltip above Dockview; Play/Stop and an active Toolbar toggle still work.

The coordinator owns conflicts in provider/bootstrap files, dependency metadata, and aggregate E2E behavior. Do not resolve a conflict by dropping generated lockfile or theme-system changes. Remove worker worktrees only after their commits are reviewed and reachable from their intended destination or retained integration branch.

## Worker evidence

Each worker must report its exact launch base, branch/worktree path, commits, changed paths, targeted command results, manual/E2E evidence, unresolved risks, and final `git status --short --branch`. Use 1–3 logical commits and review the complete diff against the recorded launch base.

## Deferred backlog

- Split and migrate Inspector, TitleBar menus, ScenePanel, PlaytestDebugger, and remaining panels.
- Replace Radix Select, Checkbox, ContextMenu, and remaining dropdown usage; remove Radix dependencies only when unused.
- Remove Tailwind and `ui.ts` only after all class-string consumers migrate.
- Move palette ownership from CSS variables into a mature Chakra token system while retaining Dockview CSS integration.
- Add `system` color-mode preference, OS synchronization, visual-regression coverage, or a separately packaged `@mmx/ui` library.

```yaml
review_contract:
  milestone: chakra-v3-studio-foundation
  planning_ref: codex/plan-chakra-v3-studio-foundation
  source_base: "5171810c528ab2ba57e26588a6c7a022502e671f"
  default_branch: main
  integration_branch: codex/integrate-chakra-v3-studio-foundation
  tasks:
    - id: "01"
      branch: codex/chakra-v3-foundation-01
      depends_on: []
      acceptance: [AC-FOUNDATION, AC-THEME]
      checks: ["pnpm typecheck", "pnpm build:renderer"]
      delivery: default-branch-pr
      base_policy: latest-default
    - id: "02"
      branch: codex/chakra-v3-toolbar-02
      depends_on: ["01"]
      acceptance: [AC-TOOLBAR, AC-OVERLAY]
      checks: ["pnpm typecheck", "pnpm build", "pnpm e2e"]
      delivery: default-branch-pr
      base_policy: latest-default
  integration_checks: ["pnpm typecheck", "pnpm test", "pnpm build", "pnpm e2e"]
  e2e_scenarios:
    - "Studio boots with Toolbar and viewport and no runtime errors"
    - "Dark/light mode updates Chakra, Dockview, and Monaco and persists after reload"
    - "Toolbar menu, tooltip, active toggle, and Play/Stop work by pointer and keyboard"
  deferred:
    - "Inspector and remaining panel migration"
    - "TitleBar and remaining Radix migration"
    - "Tailwind removal"
    - "Shared UI package extraction"
```
