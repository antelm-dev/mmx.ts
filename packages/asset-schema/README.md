# @mmx/asset-schema

Serializable asset metadata shared by the Studio, renderer, and engine — with
**no runtime dependencies**.

Currently covers sprite-animation clip tables (`AnimData`, `Region`, and related
frame/clip shapes) plus structural assertions for imported JSON.

This package is distinct from `@mmx/content-schema`, which models authored game
content (levels, definitions, terrain). Animation atlases and clip tables are
asset data, not level documents.

## Tests

```bash
pnpm --filter @mmx/asset-schema test
```
