# @mmx/content-schema

The shared authoring model for **MMX Studio**. Pure TypeScript with **no
runtime dependencies** — every part of it is unit-tested headlessly under the
repo's `node --test` runner.

It defines and validates:

- **`GameProject`** — a set of levels pinned to a schema version.
- **`LevelDocument`** — one authored level (grid, baked terrain, and placed objects).
- **`GameObjectDefinition`** — a reusable prefab (the palette catalog).
- **`LevelObjectInstance`** — one placement of a definition in a level.
- **Property metadata** (`PropertyMeta`) that drives the inspector's controls.
- **Structural / authoring validation** (`validateDocument` → `ValidationResult`).
- **Schema versioning + migration** (`SCHEMA_VERSION`, `migrateDocument`).
- **A command/history system** (`EditorCommand`, `History`, and pure command
  creators) so every document mutation is undoable.
- **Stable terrain constants** (`TerrainTile`) for serializable document tiles.

This package is the most stable domain layer in the monorepo. It does **not**
depend on `@mmx/engine`, `@mmx/ldtk-tools`, the Studio, or any runtime adapter.

Conversion to engine `LevelData` and engine-backed validation live in
`@mmx/content-engine-adapter`.

## Tests

```bash
pnpm --filter @mmx/content-schema test
```

Covers schema validation, factories, and the command history.
