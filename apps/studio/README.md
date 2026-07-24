# MMX Studio (Electron edition)

An **Electron + React** remake of MMX Studio — the visual level editor for the
deterministic MMX engine. It is a from-scratch reimplementation of
[`apps/editor`](../editor) (which stays in place, unchanged) on a new stack, with
the same functionality: inspect, place, edit, duplicate, resize, and delete every
authored level entity, then play-test the result immediately with the **real**
engine and Pixi renderer.

Like the original, it never mutates the generated level modules
(`packages/engine/src/game/levels/*.ts`). It works on the editor-friendly
`LevelDocument` and converts to/from the engine's `LevelData` through the
adapters in [`@mmx/content-schema`](../../packages/content-schema).

## Tech stack

| Concern | Choice |
| --- | --- |
| Shell | **Electron** (main + preload + renderer) built by **electron-vite** |
| UI | **React 19 + TypeScript + Vite** |
| Docking / tabs / floating panels | **Dockview** (`dockview-react`) |
| Menus, tooltips, selects, checkboxes | **Radix UI** primitives + custom CSS variables |
| Ephemeral UI state (tabs, search, toasts, context menu) | **Zustand** |
| Editing viewport & Play mode | **Pixi.js** (WebGL/WebGPU) — the real `@mmx/renderer-pixi` |
| Document JSON editing | **Monaco Editor** (self-hosted, no CDN) |
| Large scene tree & palette | **TanStack Virtual** |
| Problems panel | **TanStack Table** |
| Icons | **Lucide** |
| Tests | **Vitest** (unit) + **Playwright** (Electron e2e) |

## Architecture

The heavy lifting is **framework-agnostic TypeScript** in `src/renderer/src/core`
— `EditorStore` (document + command history), `actions`, the Pixi
`EditorViewport`, the `PlaySession`, persistence, and built-in levels. These are
ported essentially verbatim from `apps/editor` and carry no UI-framework
dependency.

React sits on top through a thin bridge:

- `app/EditorController.ts` — the single façade over the store, viewport, and play
  session (the React port of the old Angular `EditorService`). It maintains an
  immutable `EditorSnapshot`, rebuilt on every store change.
- `app/useEditor.ts` — `useSyncExternalStore` over that snapshot.
- `store/uiStore.ts` — a Zustand store for **only** ephemeral chrome: sidebar tab,
  palette search, the floating place-menu, and toasts. Selection and the document
  live in `EditorStore`, never here.

## Running it

```bash
pnpm studio          # electron-vite dev (hot-reloading Electron app)
pnpm studio:build    # production build to apps/studio/out
pnpm studio:test     # Vitest unit tests
```

From within `apps/studio`:

```bash
pnpm dev             # electron-vite dev
pnpm build           # build main + preload + renderer
pnpm start           # preview the built app
pnpm typecheck       # tsc --noEmit
pnpm test            # Vitest
pnpm e2e             # Playwright Electron smoke tests (build first)
```

## Layout

| Region | Contents |
| --- | --- |
| **Top toolbar** | Import / Save · Undo / Redo · Grid / Snap · Zoom −/＋/Fit · Level selector · Play / Stop |
| **Left dock** | Virtualized object palette (searchable) + scene tree, in two tabs |
| **Center** | Pixi viewport — terrain, entities, grid, selection outlines, resize handles |
| **Right dock** | Schema-generated **Inspector** and a **Document JSON** tab (Monaco) |
| **Bottom dock** | Asset placeholder · Problems table (validation) · current-selection details |

Panels are Dockview panels: draggable, tabbable, floatable, and pop-outable.

## Controls

Identical to the original editor:

| Action | Input |
| --- | --- |
| Select | Left-click an object (or a palette entry to start placing) |
| Add to / remove from selection | Shift-click |
| Move | Drag selected objects (one undo entry per drag) |
| Resize | Drag a handle on a single selected resizable object |
| Nudge | Arrow keys (Shift = one grid cell) |
| Duplicate | `Ctrl/Cmd+D` |
| Delete | `Delete` / `Backspace` |
| Undo / Redo | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` |
| Zoom | Mouse wheel (about the cursor), or toolbar −/＋ |
| Pan | Middle-mouse drag, or hold `Space` and drag |
| Fit to view | `F` |
| Toggle grid / snapping | `G` / `Shift+G` |
| Cancel placement / clear selection | `Escape` |
| Play / Stop | `Ctrl/Cmd+Enter`, or the toolbar button (`Esc` also stops) |

During **Play** mode: WASD/Arrows move, `Space`/`Z` jump, `X`/`Shift` dash,
`C`/`J` fire, `Q`/`E` switch weapon.

## File access

Save / Import go through native Electron dialogs, exposed to the renderer via a
context-isolated preload bridge (`window.studio`) — see `src/preload` and the two
`ipcMain.handle` handlers in `src/main`. The renderer keeps a `FileAccess`
abstraction (`core/persistence.ts`) so it still falls back to a browser
download / hidden `<input>` when run outside Electron. A local recovery copy is
written to `localStorage` on every change.

## Build notes

- **Strict CSP.** The renderer runs under `script-src 'self'` (no `unsafe-eval`),
  so two accommodations are load-bearing:
  - `import "pixi.js/unsafe-eval"` in `main.tsx` swaps Pixi's `new Function`
    shader/uniform generation for polyfills.
  - `connect-src` allows `data:` because Pixi's `Assets.load` fetches the sprite
    sheets, which Vite inlines as `data:` URIs.
- **Monaco is self-hosted.** `components/monacoSetup.ts` bundles the editor core
  and the JSON worker locally (`?worker`) and hands them to
  `@monaco-editor/react`'s loader, instead of the default CDN fetch the CSP would
  block. Note the worker import paths omit the `esm/vs/` prefix — monaco's
  `exports` map already rewrites `./*` to `./esm/vs/*`.
- **Main/preload are CommonJS.** Electron loads them best as CJS
  (`require("electron")` gives the API object); the package intentionally omits
  `"type": "module"`. The Vite-bundled renderer is ESM regardless.
