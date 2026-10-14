# Task 05 — Inspector and Room panel form controls

## Mission

Move the form controls of `src/renderer/src/components/Inspector.tsx` (Radix `Checkbox`, Radix `Select`, `inputCls` inputs, `fieldLabel` captions, `actionBtn` footer) and `RoomPanel.tsx` (`inputCls`, `fieldLabel`, `btnCls`, `sectionTitle`) to Chakra-backed Studio wrappers. Read the coordinator README before starting.

## Launch base and isolation

- Prerequisite: Task 02 merged and reachable from refreshed `main`.
- Delivery: `default-branch-pr` to `main`. Base policy: `latest-default`; the coordinator records `<exact-launch-base>`.

```text
git worktree add E:/Adel/Documents/Orgs/mmx-studio-chakra-v3-forms-05 -b codex/chakra-v3-forms-05 <exact-launch-base>
cd E:/Adel/Documents/Orgs/mmx-studio-chakra-v3-forms-05
git status --short --branch
```

## Context and owned scope

Owned files: `Inspector.tsx`, `RoomPanel.tsx`, new wrappers `src/renderer/src/ui/editor/field.tsx` (label + control + invalid state), `ui/editor/checkbox.tsx`, `ui/editor/select.tsx`, `ui/editor/action-button.tsx`, and tests. Inspector has about 17 inputs/selects, 11 field labels, 14 section titles and 12 footer actions; RoomPanel about 14 inputs and 9 section titles. Numeric fields parse on commit (Enter/blur) and show an invalid border via `inputCls(bad)`. The Inspector `Select` is portaled.

## Required work

1. `Field` wrapper over Chakra `Field.Root/Label/Input` (and `Field.ErrorText` only if a message exists today) with the compact 32px height and `studio.*` tokens; a `NumberField` variant only if it removes repeated parse/commit code, otherwise keep the existing handlers and pass them through.
2. `Checkbox` wrapper over Chakra `Checkbox` preserving the accessible label and `checked`/`onCheckedChange` semantics used today.
3. `Select` wrapper over Chakra `Select` with `createListCollection`, portaled and positioned; keep the displayed option labels and the committed values identical. Use `NativeSelect` only if a select has no custom item rendering and the native look is acceptable in both themes.
4. `ActionButton` (bordered, full-width, `danger` variant) replacing `actionBtn` / `actionBtnDanger` consumers in Inspector; keep disabled states.
5. Replace `sectionTitle` / `sectionTitleSub` and `fieldLabel` consumers in both files with a small `SectionTitle` and the `Field.Label`; keep the exact text and order.
6. Preserve commit timing, undo granularity (one history entry per committed edit), and keyboard behavior (Enter commits, Escape reverts if that exists today, Tab order unchanged).
7. E2E: select an object, edit a numeric field with Enter and with blur, enter invalid text and assert the invalid style, toggle a checkbox, change a select, undo and assert the prior value.

## Out of scope and contracts

Do not touch the panel shell/scroll classes or the Scene/Palette list rows (Task 06), menus (03/04) or Toolbar. Do not remove Radix packages or `ui.ts` exports (Task 07). Do not change which properties the Inspector exposes.

## Verification and delivery

Satisfy `AC-FORMS`. Run `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm e2e`. Manually verify both themes, invalid/disabled states, select layering over Dockview, and that typing in a field never triggers editor shortcuts.

Create 1–3 logical commits. Report commits, changed paths, command results, undo/commit evidence, remaining Radix and `ui.ts` usage in owned files, risks, and final `git status --short --branch`.
