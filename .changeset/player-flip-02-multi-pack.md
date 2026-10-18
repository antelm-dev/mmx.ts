---
"@mmx/content-schema": minor
"@mmx/build-tools": minor
"@mmx/studio": minor
---

The migration on open is multi-pack (contract C-MULTI), so every project gets X and Zero before they leave the engine. `withStarterPack` keeps its name and signature: a manifest without `packs` gets the MMX Starter, X and Zero; one with packs gets each player pack (`mmx-player-x` / `mmx-player-zero`) whose marker it lacks, so every project made since the Starter pack gets X and Zero together; `packs: []` (base only), a project with both player packs and a malformed `packs` are left as is. Only missing records are added (`fillKeys: false`), a project's own record always wins and record order is kept; each added pack's marker is set. `@mmx/content-schema` exposes `MMX_PLAYER_X` and `MMX_PLAYER_ZERO` like `MMX_STARTER`, and depends on both player packs. build-tools `loadProject` applies it in memory; Studio applies it on open before validating the manifest (so `player.loadout` may name a loadout a pack adds), not dirty, and the next Save and an export write `data/game.json` before `project.json`. New Studio projects carry the three packs. No gameplay change: projects still compile to hash `36e5bb6d8c3547a6`.
