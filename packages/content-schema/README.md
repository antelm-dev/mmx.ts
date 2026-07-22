# @mmx/content-schema

The shared authoring model for **MMX Studio** (`apps/editor`). Pure TypeScript,
no runtime dependencies beyond `@mmx/engine`'s types — so every part of it is
unit-tested headlessly under the repo's `node --test` runner.

It defines and validates:

- **`GameProject`** — a set of levels pinned to a schema version.
- **`LevelDocument`** — one authored level (grid, baked terrain, and placed objects).
- **`GameObjectDefinition`** — a reusable prefab (the palette catalog).
- **`LevelObjectInstance`** — one placement of a definition in a level.
- **Property metadata** (`PropertyMeta`) that drives the inspector's controls.
- **Validation** (`validateDocument` → `ValidationResult`).
- **Schema versioning + migration** (`SCHEMA_VERSION`, `migrateDocument`).
- **A command/history system** (`EditorCommand`, `History`, and pure command
  creators) so every document mutation is undoable.

## Adapters

The one place the authoring model and the engine model meet:

| Function | Direction |
| --- | --- |
| `levelDataToDocument(data)` | `LevelData` → `LevelDocument` (import) |
| `documentToLevelData(doc)` | `LevelDocument` → `LevelData` (Play / export) |

Both are **lossless** for catalog objects: import preserves each entity's stable
`iid` and order, and export rebuilds it from the definition's base fields layered
with the instance's overrides. A round-trip is the identity function — the tests
assert this against the real Stage 1 and Stage 2 modules, which is what keeps the
existing LDtk import/export pipeline undisturbed.

## Tests

```bash
pnpm --filter @mmx/content-schema test
```

Covers schema validation, adapter round-tripping, and the command history.
