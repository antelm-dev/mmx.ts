# MMX Studio

An **Angular + Angular Material** visual level editor for the deterministic MMX
engine. It lets you inspect, place, edit, duplicate, and delete every authored
level entity and play-test the result immediately with the **real** engine and
Pixi renderer.

MMX Studio is a development tool, not part of the shipping game. It never mutates
the generated level modules (`packages/engine/src/game/levels/*.ts`) — those stay
owned by [`@mmx/ldtk-tools`](../../packages/ldtk-tools). Instead it works on an
editor-friendly JSON document (`LevelDocument`) and converts to/from the engine's
`LevelData` through the adapters in [`@mmx/content-schema`](../../packages/content-schema).

## Tech stack

- **Angular 22** standalone, **zoneless** (signals drive change detection), with
  **Angular Material** (Material 3, dark theme) for the chrome.
- Runs under **Vite** via the [Analog](https://analogjs.org) `vite-plugin-angular`
  (`@analogjs/vite-plugin-angular`) rather than the Angular CLI. This is
  deliberate: the Pixi renderer imports sprite sheets with Vite-native `.png` and
  `?raw` imports, so keeping Vite's asset pipeline is what makes reusing the real
  engine renderer in Play mode work — the same reason apps/web is on Vite.
- The Pixi editing viewport and the engine/Play logic are **framework-agnostic**
  TypeScript (`src/viewport`, `src/state`, `src/play`, `src/io`); Angular is only
  the UI shell. A single `EditorService` bridges the framework-agnostic
  `EditorStore` to Angular signals.

## Running it

```bash
pnpm editor          # Vite dev server on http://localhost:5174
pnpm editor:build    # production build to apps/editor/dist
```

Stage 1 opens by default. Use the **Levels** list (top-left) to switch between
the built-in Stage 1 and Stage 2 (Mechanics Demo), or **Import** a saved
`.json` document from the toolbar.

### Build configuration (three load-bearing settings)

This app compiles Angular **and** consumes three workspace packages as raw
TypeScript source — `@mmx/engine`, `@mmx/renderer-pixi` and `@mmx/content-schema`
all export `src/*.ts` rather than built JS. Making both work needs all three of
the following. Remove any one and the browser is served untransformed TypeScript
and the app renders a **blank page**:

1. **`tsconfig.app.json` must exist.** `@analogjs/vite-plugin-angular` looks for
   it by that exact name. Without it the plugin compiles nothing in dev and the
   browser gets raw `.ts` (`Uncaught SyntaxError: Unexpected token 'export'`).
2. **`resolve.mainFields: ['module']`** in `vite.config.ts` — required by the plugin.
3. **`esbuild` must be set, and the Angular plugin must skip the workspace
   packages** via `transformFilter`. The plugin resolves `config.esbuild ?? false`,
   i.e. it *disables* Vite's own TypeScript transform unless the config supplies
   one. The `@mmx/*` packages are plain TypeScript (not Angular) and sit outside
   the Angular compiler's rootDir, so if they are left to the Angular compiler it
   emits them **empty** — which surfaces as
   `does not provide an export named 'History'`. `transformFilter` returns `false`
   for those paths, handing them to esbuild instead.

## Layout

| Region | Contents |
| --- | --- |
| **Top toolbar** | Import / Save · Undo / Redo · Grid / Snap · Zoom −/＋/Fit · Play / Stop |
| **Left sidebar** | Level list, and a searchable object palette grouped by category |
| **Center** | Pixi viewport — terrain, entities, grid, selection outlines, resize handles |
| **Right** | Schema-generated inspector: transform + entity-specific fields, inline validation |
| **Bottom** | Asset browser placeholder · Problems (validation) panel · current-selection details |

## Controls

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

## File format

Saving downloads a `LevelDocument` as pretty-printed JSON:

```jsonc
{
  "schemaVersion": 1,
  "id": "Stage1",
  "name": "Stage1",
  "gridSize": 16,
  "cols": 100,
  "rows": 32,
  "tiles": [1, 1, 0, ...],           // row-major terrain, length cols*rows
  "slopes": { "2716": [0, 8] },      // non-45° ramp profiles by tile index
  "objects": [
    {
      "id": "8dc7b05d-...",          // stable instance id (the LDtk iid)
      "definitionId": "enemy.metool",
      "x": 232, "y": 342,
      "overrides": { "FacesRight": false }
    }
  ]
}
```

- **`tiles` / `slopes`** carry the baked terrain unchanged from the LDtk import, so
  Play mode can hand them straight to the engine.
- A local **recovery copy** is written to `localStorage` on every change; the
  editor reads it on demand (see `io/persistence.ts`).
- File access sits behind the `FileAccess` interface, so a future Tauri desktop
  build can drop in native open/save dialogs without touching the editor.

## Definitions vs. instances

The model keeps four things strictly separate (see `@mmx/content-schema`):

1. **`GameObjectDefinition`** — a reusable *prefab*: "what a Metool is." Immutable
   catalog data (`definitions.ts`) that carries the engine entity id, base fields,
   editor placement/colour, and the inspector's property metadata.
2. **`LevelObjectInstance`** — one *placement* of a definition in a level: a
   position, an optional size, and per-instance `overrides`.
3. **Runtime engine objects** (`Enemy`, `MovingPlatform`, …) — built by the engine's
   `loadLevel` from `LevelData` only while a Play session runs.
4. **Renderer / audio assets** — owned by `@mmx/renderer-pixi` and the game apps.

"Kind" is folded into the definition identity: a Metool and a Bat are two palette
entries (`enemy.metool` / `enemy.bat`), which is why the inspector edits *facing*
but not *kind* — changing kind means swapping the definition. This mirrors exactly
what the engine's `loadLevel` validates the `Kind` field against.

## Registering a future behaviour or object type

Behaviours are **registered TypeScript**, never user-authored scripts. To add one:

1. **Add a definition** to `OBJECT_DEFINITIONS` in
   `packages/content-schema/src/definitions.ts`: give it an `id`, `category`,
   `engineId` (the LDtk entity id the engine reads), base `fields`, an `editor`
   block (placement / resizable / colour), and `properties` metadata for every
   editable field. The palette and inspector pick it up automatically.
2. **Teach the adapter** the mapping in `adapters.ts` (`definitionIdFor`) if the new
   object needs to resolve from an engine entity id + `Kind`.
3. **Add validation** in `validation.ts` if it has invariants beyond the generic
   number/enum/bounds checks.
4. **Implement the runtime behaviour** in `@mmx/engine` and read the new entity in
   `packages/engine/src/game/level.ts` (`loadLevel`), exactly as the existing
   entities are read. The editor stays a thin authoring layer over that.

## Current limitations

- **Slopes don't re-bake.** `Slope` entities round-trip and render, but editing or
  adding one does **not** recompute the terrain `tiles`/`slopes` — that bake is
  `@mmx/ldtk-tools`' job. Play uses the already-baked terrain from import.
- **No audio in Play mode.** The editor has no sound stack; physics, camera,
  sprites, and cosmetic effects are the shipping path, but SFX are omitted.
- **No LDtk round-trip yet.** Import is from the generated `LevelData` modules (and
  from saved editor JSON); there is no direct `.ldtk` read/write here.
- **Single level per document.** `GameProject` exists in the schema but the editor
  UI opens one `LevelDocument` at a time.
- **Marquee selection** is not implemented; select by click / shift-click.
