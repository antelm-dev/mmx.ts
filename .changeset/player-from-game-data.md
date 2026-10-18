---
"@mmx/engine": minor
"@mmx/renderer-pixi": minor
---

The runtime builds and plays the player from its compiled loadout and the scene's game data alone. The player carries its loadout's `weapons` (in cycle order) and starts on its `initialWeapon`; ammo, ammo cost, the shots-in-flight cap and each shot come from the weapon and projectile definitions, and every ability takes its full config from the loadout, with no constant behind it. Zero's loadout has no weapon, so Zero no longer spawns with the buster and Dark Arrow, and Zero's dash wall jump now kicks with Zero's own wall-jump timing instead of X's; X plays exactly as before and the built-in game data hash is unchanged.

`@mmx/engine` no longer exports the player constants it read from the built-in data at import time (`WALK_SPEED`, `DASH_SPEED`, `CHARGE_*`, `PLAYER_DAMAGE_*`, `PLAYER_INTRO_*`, `BUSTER_SHOTS`, `WEAPON_SHOTS`, `WEAPON_ORDER`, `SUB_WEAPON_CONFIG`, `SUB_WEAPON_MAX_AMMO`, `MAX_SHOTS_ALIVE`, `WEAPON_PALETTE`, the `WeaponId` type and the rest of that family); read them from the compiled game data instead. `MAX_HEALTH` and `BODY_HALF_W`/`BODY_HALF_H` remain as plain bare-Actor defaults. `Character.spawnBuster` and `can_shoot` give way to `fireWeapon`/`fireActiveWeapon` and `canFireWeapon`/`canFireActiveWeapon`; `activeWeapon` is `string | null` and `weapons`, `getWeapon` and `getWeaponMaxAmmo` describe what the player carries. `new Projectile` now takes the firing weapon's shots.

`@mmx/renderer-pixi` owns the weapon palettes: `WEAPON_PALETTE` (by weapon id), `BASE_PALETTE` and `weaponPalette`, which falls back to the identity recolor for an unknown weapon or none. The HUD shows the weapon bar for any finite-ammo weapon the player carries, scaled to that weapon's tank.
