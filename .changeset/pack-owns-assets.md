---
"@mmx/pack-mmx-starter": minor
"@mmx/studio": patch
"@mmx/renderer-pixi": patch
---

The MMX Starter pack owns its art. `@mmx/pack-mmx-starter` gains `assets/` (the Metool, Bat and four capsule sheets with `enemy_anims.json` and `pickup_anims.json`), `assets.json` (the 12 manifest entries naming them) and `ATTRIBUTION.md`, all exported. Studio's `build-enemies.mjs` and `build-pickups.mjs` write into the pack; `generate-manifest.mjs` writes the pack fragment and both templates (`mmx-starter`, `mmx-demo`), copies the pack's files into them and formats the output; the stale `sync-resources.mjs` (and `pnpm sync:resources`) is removed. The templates keep byte-identical copies, checked by a test, so a project made from the starter is unchanged. renderer-pixi drops its unused `assets/sprites` copy.
