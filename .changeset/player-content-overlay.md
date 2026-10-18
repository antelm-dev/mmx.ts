---
"@mmx/engine": minor
"@mmx/build-tools": minor
"@mmx/studio": minor
---

A project's `data/game.json` may now add or replace `abilities`, `loadouts` and `weapons`, and replace any projectile, those a player weapon fires included; `physics` is still refused. `@mmx/engine`: a `spawn` prefab whose loadout is missing no longer fails `compileGameData`; it is a `player.missing` warning, and building the player still throws "unknown loadout". A loadout that can jump without a walk or fall slot is a `loadout.airControl` warning. A loadout `slots` or `weapons`, or a weapon `projectiles` or `chargeThresholds`, that is not an array is a `value.array` error with its field path instead of a thrown TypeError. `@mmx/build-tools`: `loadProject` checks `player.loadout` against the project's merged loadouts (not at all when its game data failed, which is already reported) and reports the compile warnings as warning issues. `@mmx/studio`: opening, saving and exporting a project accept a `player.loadout` its overlay adds (`LOADOUT_IDS` is gone), the loadout picker lists it, Play reads the player's body from the project's loadout and refuses to start, with a toast, when the project has no such loadout, and the player clip check reads the project's loadouts. Game hash unchanged.
