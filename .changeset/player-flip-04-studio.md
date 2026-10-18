---
"@mmx/studio": patch
---

Play builds the scene from the project's game data only: `createPlaytest` requires `gameData`, since the engine ships no player. A project's `player.loadout` must name a loadout its packs or `data/game.json` provide, and a project without `data/game.json` (`packs: []`) shows `game-data.player.missing` in Problems. With no project open, Studio uses the core with the X and Zero packs, so Play still has X.
