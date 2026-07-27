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

- `parseProject(raw)` migrates then validates and returns path-addressed
  diagnostics.
- `migrateProject(raw)` upgrades supported older documents to the current
  schema.
- `validateProject(doc)` performs structural checks for IDs, paths,
  references, duplicates, and asset kinds.
- `serializeProject(doc)` and `normalizeProject(doc)` produce deterministic
  export order.

Use `parseProject` at untrusted JSON boundaries. It reports ordinary validation
failures as data; use `assertProject` only where an exception is the intended
control flow.

Project paths must be portable relative paths. Resolving those paths against a
filesystem root and enforcing containment belongs to `@mmx/build-tools`.

This package has no engine, Pixi, Web Audio, Electron, Vite, or Node filesystem
dependency.

## Development

```bash
pnpm --filter @mmx/project-schema test
pnpm --filter @mmx/project-schema build
```
