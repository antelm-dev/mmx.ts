# Task 07 — Remove Radix, `ui.ts` and Tailwind

## Mission

Delete what the migration made dead: the five `@radix-ui/*` packages, `src/renderer/src/ui.ts`, Tailwind and its build wiring, and any Tailwind class left inside `src/renderer/src/ui/` wrappers. Move the `--studio-*` palette to a single declaration that both Chakra tokens and Dockview CSS consume. Read the coordinator README before starting.

## Launch base and isolation

- Prerequisite: Tasks 03 and 06 merged and reachable from refreshed `main` (which then also contains 04 and 05).
- Delivery: `default-branch-pr` to `main`. Base policy: `latest-default`; the coordinator records `<exact-launch-base>`.

```text
git worktree add E:/Adel/Documents/Orgs/mmx-studio-chakra-v3-cleanup-07 -b codex/chakra-v3-cleanup-07 <exact-launch-base>
cd E:/Adel/Documents/Orgs/mmx-studio-chakra-v3-cleanup-07
git status --short --branch
```

## Context and owned scope

Owned files: `package.json`, `pnpm-lock.yaml`, `src/renderer/src/ui.ts` (delete), `src/renderer/src/styles.css`, Vite/PostCSS config, `src/renderer/src/ui/system.ts`, `src/renderer/src/ui/**` (strip residual Tailwind classes), `App.tsx` (root providers), and the E2E specs. `styles.css` currently starts with `@import "tailwindcss"` and holds the `--studio-*` palette per `data-theme` plus Dockview overrides; `app/theme.ts` sets `data-theme` synchronously before React mounts and must not change.

## Required work

1. Confirm zero importers: `grep -rn "@radix-ui" src/` and `grep -rn "ui.js\"" src/renderer/src` must be empty outside `ui/`. If anything remains, stop and report; do not migrate it here.
2. Remove the Radix packages and Tailwind (`tailwindcss`, `@tailwindcss/vite` or PostCSS plugin, `tailwind.config.*` if present) from `package.json`; regenerate the lockfile with `pnpm install` (non-frozen). If the `electron-ipc-module#main` git dependency blocks resolution, keep its locked commit and report the deviation as round 1 did.
3. Delete `ui.ts`. Replace Tailwind utility classes still used inside `ui/` wrappers and in `styles.css` `@apply`/`@theme` blocks with Chakra props or plain CSS.
4. Palette ownership: declare the `--studio-*` variables once per theme in `styles.css` (unchanged values) and keep `system.ts` aliasing them; or, if simpler, define the colors as Chakra tokens with `_dark`/`_light` conditions keyed on `[data-theme]` and point Dockview CSS at the generated `--chakra-colors-*` variables. Pick one; both themes must look identical before and after (compare screenshots of the full window in dark and light).
5. Remove the root Radix `TooltipProvider` if Task 02 left it, and any `preflight`-related workaround that no longer applies.
6. E2E: add an assertion that the built renderer CSS contains no Tailwind preflight marker and the bundle contains no `@radix-ui` module; keep the theme-toggle-and-reload scenario and extend it to check a panel, a Dockview tab and Monaco background colors after toggle.

## Out of scope and contracts

No visual changes. No new components. Do not touch `app/theme.ts`, Monaco or Pixi setup, or the Dockview layout code.

## Verification and delivery

Satisfy `AC-CLEANUP`. Run `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`. Report bundle size before/after (`out/renderer` CSS and JS totals).

Create 1–3 logical commits (dependency removal, `ui.ts`/Tailwind removal, palette ownership). Report commits, changed paths, command results, both grep results, screenshot comparison notes, risks, and final `git status --short --branch`.
