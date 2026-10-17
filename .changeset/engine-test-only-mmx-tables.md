---
"@mmx/engine": minor
---

The test-only MMX tables leave the engine: `ENEMY_STATS`, `LIFE_CAPSULE_STATS`, `WEAPON_CAPSULE_STATS` and their `LifeCapsuleStats` / `WeaponCapsuleStats` types are no longer exported, and the internal `makeMetool`, `makeBat` and `makePantheon` factories are gone. Build an enemy with `spawnEnemy` from the scene's game data, and read a pickup from `gameData.pickups`. The engine's tests now pass the MMX Starter pack explicitly. The built-in game data hash is unchanged.
