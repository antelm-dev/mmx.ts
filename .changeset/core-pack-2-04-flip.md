---
"@mmx/engine": major
"@mmx/content-schema": patch
"@mmx/studio": patch
---

The MMX objects leave the engine. `GAME_DATA` is now the core only: the players, their weapons and shots, the abilities and the level primitives (`spawn`, `hazard`, `camera-zone`). Metool, Bat, Pantheon and their actors, `pantheon_shot`, the four Life/Weapon capsules, the moving and falling platforms, the conveyor and their ten prefabs are gone; they live in the MMX Starter pack (`@mmx/pack-mmx-starter`), which projects carry in `data/game.json`. `COMPILED_GAME_DATA.hash` becomes `ad52563298993e03`. A project carrying the pack (every template, and every old project once migrated on load) still compiles to `36e5bb6d8c3547a6` and plays as before. A `packs: []` project, or Studio with no project open, offers only spawn, hazard, slope and camera zone; content-schema's `OBJECT_DEFINITIONS` is those four.
