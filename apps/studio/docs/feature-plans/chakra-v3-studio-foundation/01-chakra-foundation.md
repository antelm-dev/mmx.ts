# Task 01 — Chakra foundation

## Mission

Introduce a static Chakra UI v3 system and renderer provider that can coexist with the current Tailwind/Radix UI without changing visible behavior. Read the coordinator README before starting.

## Launch base and isolation

- Delivery: `default-branch-pr` intended for `main`.
- Base policy: `latest-default`; no task prerequisites.
- Coordinator must refresh `main`, resolve it to an exact commit, and replace `<exact-launch-base>` below.

```text
git worktree add E:/Adel/Documents/Orgs/mmx-studio-chakra-v3-foundation-01 -b codex/chakra-v3-foundation-01 <exact-launch-base>
cd E:/Adel/Documents/Orgs/mmx-studio-chakra-v3-foundation-01
git status --short --branch
```

Start only from a clean worktree. Preserve unrelated/user-owned changes if discovered and report them rather than absorbing them.

## Context and owned scope

Primary boundary: Chakra dependencies and `src/renderer/src/ui/` foundation. Expected primary files are `package.json`, generated `pnpm-lock.yaml`, `src/renderer/src/ui/system.ts`, `src/renderer/src/ui/provider.tsx`, and `src/renderer/src/main.tsx`. A narrowly required typegen output/config adjustment is allowed; avoid feature component edits.

The existing palette and Dockview integration live in `src/renderer/src/styles.css`; theme persistence lives in `app/theme.ts` and `store/uiStore.ts`. Keep those contracts intact. Use `coll-front/packages/ui/src/chakra-theme.ts` and `components/provider.tsx` only as API examples—improve on them with a module-level system singleton and separated provider responsibilities.

## Required work

1. Add Chakra React, Emotion, and the Chakra CLI using a compatible, aligned Chakra version line. Add a repeatable `chakra:typegen` script and integrate it into the appropriate validation workflow without changing packaging semantics.
2. Define a static Studio system. Disable or tightly control preflight so Chakra does not reset Dockview, Monaco, Pixi canvas, or Electron title-bar behavior.
3. Expose semantic tokens for the current Studio vocabulary (`bg`, `surface`, `raised`, foreground levels, borders, accent/status, popover/menu/chrome). Alias existing `--studio-*` variables during this milestone rather than duplicating hex values.
4. Add a minimal `StudioProvider` using the singleton system and wrap the renderer root. Do not add asynchronous config loading, `next-themes`, broad global CSS, or a loading spinner.
5. Preserve synchronous theme application, current `data-theme`, CSP compatibility, `file://` asset loading, and the deliberate absence of React StrictMode.

## Out of scope and contracts

Do not migrate Toolbar or any feature component, remove Tailwind/Radix, redesign color mode, or create a workspace package. Task 02 may rely on `StudioProvider`, the exported system, semantic token names, and generated Chakra typings. Treat those names as the shared contract and document any necessary deviation in the commit message/evidence.

## Verification and delivery

Satisfy `AC-FOUNDATION` and `AC-THEME` from the README. Run:

```text
pnpm install --lockfile-only
pnpm chakra:typegen
pnpm typecheck
pnpm build:renderer
```

Also launch the existing development or built Electron renderer long enough to confirm the shell, Dockview, viewport, and title-bar theme toggle still render without console errors. The change is eligible for an independent default-branch PR only if current behavior is unchanged and no incomplete Chakra UI appears.

Create 1–3 logical commits. Review the full diff from the exact launch base and report the required worker evidence from the README, including generated-file changes and any reset/CSP risks.
