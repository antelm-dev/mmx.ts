import type { PickupDefinition } from "./types.js";

/**
 * Pickup definitions — Life Energy and Weapon Energy capsules in both sizes.
 * The shared tick-heal / tick-refill algorithm stays in code (Pickup.ts); the
 * definition only carries which effect runs and how much it grants.
 */
export const pickups = {
  "life.small": {
    id: "life.small",
    behavior: "pickup.life",
    sheet: "sheal",
    amount: 2, // SmallHeal.tscn heal
  },
  "life.large": {
    id: "life.large",
    behavior: "pickup.life",
    sheet: "heal",
    amount: 8, // Heal.tscn heal
  },
  "weapon.small": {
    id: "weapon.small",
    behavior: "pickup.weapon-energy",
    sheet: "sammo",
    amount: 2, // SmallAmmo.tscn ammo
  },
  "weapon.large": {
    id: "weapon.large",
    behavior: "pickup.weapon-energy",
    sheet: "ammo",
    amount: 8, // Ammo.tscn ammo
  },
} satisfies Record<string, PickupDefinition>;
