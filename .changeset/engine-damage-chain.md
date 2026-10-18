---
"@mmx/engine": minor
---

One damage chain: buster shots, saber swings, contact, enemy shots and hazards all resolve through the exported `computeDamage` (forced value, else `round(base × multiplier / 100)`, minus armor with a floor of 1; multiplier 0 is immunity), and every resolved hit is recorded in `Stage.damageEvents` (`DamageEvent`, cleared each tick). New optional stat fields with engine defaults, validated as whole numbers: actor `armor` and `regenEveryFrames`, enemy `invulnerabilityFrames` (default 0) and `touchKnockback`, projectile `knockback` and `element` (`Knockback` is exported).

Spikes now respect the player's invulnerability: a lethal hazard (the default) kills past death protection only when he is not invulnerable, and a hazard with `Lethal` off deals its `Damage` (default 4) through the chain with knockback away from it. The `hazard` prefab gains the `Lethal` and `Damage` fields and the `hazard` environment the `damage: 4` default, so the game-data hash moves: the core hash is now `a6585ecdf7af3d2b` (was `a188bb2adc199c77`) and core + MMX Starter, X and Zero `9d8a9efb04583a0e` (was `36e5bb6d8c3547a6`). Replays recorded before this change no longer load. Simulation digests are unchanged.
