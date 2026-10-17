---
"@mmx/project-schema": minor
"@mmx/content-schema": minor
"@mmx/build-tools": minor
"@mmx/studio": minor
---

Projects carry the MMX Starter pack. The project manifest gains an optional `packs: { id, version }[]` (validated, kept by `serializeProject` even when empty). `withStarterPack(manifest, overlay)` (`@mmx/content-schema`) gives a manifest without `packs` the MMX Starter records its `data/game.json` lacks, by id, and `packs: [mmx-starter@1]`; a manifest with `packs` (`[]` = base only) is left as is and a project's own records are never replaced. build-tools `loadProject` applies it in memory; Studio applies it on open (not dirty, written by the next Save) and exports the migrated data. New projects, the `mmx-starter` and `mmx-demo` templates and the Zero import carry the pack and the marker. No gameplay change: the pack equals the built-in records, so projects still compile to hash `36e5bb6d8c3547a6`.
