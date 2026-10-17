---
"@mmx/engine": minor
---

The runtime reads every game object from the scene's game data. Life and Weapon Energy capsules take their amount and sheet from `life.<Kind>` / `weapon.<Kind>` (any Kind with a matching pickup), and moving platforms, falling platforms and conveyors fall back to their environment definition's `defaults`. A level that places one of these without its definition fails to compile (`pickup.kind`, `environment.missing`). Project overlays now also accept `pickups`, `environments` and `projectiles`; a projectile a weapon fires stays rejected. `compileGameData` validates pickup sheets and each environment's defaults. No module reads an enemy, pickup or pack environment at import: `ENEMY_STATS`, `LIFE_CAPSULE_STATS` and `WEAPON_CAPSULE_STATS` are lazy, and the unused `PANTHEON_SHOT`, `PATROL_*`, `HIDE_*`, `STUN_DURATION` and `BAT_*` constants are removed. The built-in game data hash is unchanged.
