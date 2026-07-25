import type { WeaponDefinition } from "./types.js";

/**
 * Weapon definitions. The buster is infinite-ammo and shot-cap gated; Dark Arrow
 * is the ported sub-weapon, ammo gated (SUB_WEAPON_MAX_AMMO 28, flat cost 1).
 *
 * `projectiles` is indexed by charge level — index clamps to the last entry, so
 * the buster's level-3 charge lands on the same Charged Buster as level 2, and
 * Dark Arrow's single entry answers every level.
 */
export const weapons = {
  buster: {
    id: "buster",
    maxAmmo: "infinite",
    maxLiveShots: 3, // MAX_SHOTS_ALIVE
    chargeThresholds: [1.75, 2.75], // CHARGE_LEVEL_3 / CHARGE_LEVEL_4
    projectiles: ["lemon", "medium", "charged"], // BUSTER_SHOTS order
    ammoCost: 0,
  },
  dark_arrow: {
    id: "dark_arrow",
    maxAmmo: 28, // SUB_WEAPON_MAX_AMMO
    maxLiveShots: 3, // DARK_ARROW_MAX_SHOTS_ALIVE
    chargeThresholds: [],
    projectiles: ["dark_arrow"],
    ammoCost: 1, // DARK_ARROW_AMMO_COST
  },
} satisfies Record<string, WeaponDefinition>;
