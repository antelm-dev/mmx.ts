# @mmx/content-schema

Shared, engine-independent authoring model for MMX Studio. It defines portable
level documents and prefab instances, validates authored content, supports
schema migration, and provides undoable editor commands.

## Entry points

| Import                       | Purpose                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `@mmx/content-schema`        | Documents, definitions, validation, commands, factories, migration, terrain helpers, and stable IDs |
| `@mmx/content-schema/slopes` | Slope baking and application helpers                                                                |

The main model includes:

- `GameProject`, `LevelDocument`, `GameObjectDefinition`, and
  `LevelObjectInstance`
- property metadata used to build inspector controls
- presentation-only decoration instances
- `validateDocument` and structured validation issues
- `SCHEMA_VERSION` and `migrateDocument`
- `History`, `EditorCommand`, and pure command creators
- `createLevelDocument` for a fresh, valid level

```ts
import { createLevelDocument, validateDocument } from "@mmx/content-schema";

const level = createLevelDocument({ name: "Training Room" });
const validation = validateDocument(level);
```

The package depends only on the small serialized types in `@mmx/contracts`; it
does not import the engine, renderer, Studio application, or filesystem APIs.
Conversion from `LevelDocument` to engine `LevelData` belongs to
`@mmx/build-tools`.

## Slopes

```ts
import { applySlopes, bakeSlope } from "@mmx/content-schema/slopes";
```

Slope helpers convert authored slope rectangles into the stable tile and slope
map representation consumed by the engine. Keep slope baking in authoring or
build workflows rather than recomputing it during simulation.

## Development

```bash
pnpm --filter @mmx/content-schema test
pnpm --filter @mmx/content-schema build
```
