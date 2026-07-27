# @mmx/project-schema

Portable Studio-exported project contract: identity, runtime compatibility,
level references, and a normalized asset manifest with stable logical IDs.

## Public API

```ts
import {
  PROJECT_SCHEMA_VERSION,
  parseProject,
  migrateProject,
  validateProject,
  serializeProject,
  normalizeProject,
  type ProjectDocument,
  type ProjectAsset,
} from "@mmx/project-schema";
```

- `parseProject(raw)` — migrate then validate; returns path-addressed diagnostics
- `migrateProject(raw)` — upgrade to the current schema version (v1 has no steps)
- `validateProject(doc)` — structural checks (ids, paths, duplicates, kinds)
- `serializeProject(doc)` / `normalizeProject(doc)` — deterministic export order

This package has no engine, Pixi, Web Audio, Electron, Vite, or Node `fs`
dependencies.
