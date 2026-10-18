---
"@mmx/content-schema": minor
"@mmx/pack-mmx-starter": minor
"@mmx/studio": minor
---

A project can install or update the MMX Starter pack. `@mmx/pack-mmx-starter` gains `bindings.json` (the `enemyAnimations` / `pickupAnimations` keys for `game/data.json`). `@mmx/content-schema` gains `mergePack`, which adds what a pack has and a project lacks — records, keys missing from a record it has, manifest asset entries and binding keys — never replaces a value, returns `{ added, skipped }` and sets the project's `packs` entry to the pack's version; `withStarterPack` now runs on it (data only, as before). Studio's File → Install / update MMX Starter pack… (enabled for a saved project) shows what would be added and kept, writes nothing until confirmed, copies the pack's missing files without overwriting any, writes `data/game.json` and `game/data.json` before `project.json`, reopens the project and shows a summary. The pack's art is emitted next to the main bundle (`out/main/packs/mmx-starter`), so the packaged app has it. The template READMEs no longer mention the removed `sync-resources.mjs`. Game hash unchanged.
