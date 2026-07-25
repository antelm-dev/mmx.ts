import type { LoadoutDefinition } from "./types.js";

/**
 * Player loadouts. The default "X" loadout reproduces Player.tscn's ability node
 * list, in the exact composition order the runtime relies on for tie-breaking,
 * and equips the buster with Dark Arrow available as the ported sub-weapon.
 */
export const loadouts = {
  "player.x": {
    id: "player.x",
    actor: "player.x",
    slots: [
      { ability: "player.idle" },
      { ability: "player.walk" },
      { ability: "player.fall" },
      { ability: "player.wall-slide" },
      { ability: "player.dash" },
      { ability: "player.air-dash" },
      { ability: "player.jump" },
      { ability: "player.dash-jump" },
      { ability: "player.wall-jump" },
      { ability: "player.dash-wall-jump" },
      { ability: "player.intro" },
      { ability: "player.damage" },
      { ability: "player.death" },
      { ability: "player.shot" },
      { ability: "player.charge" },
    ],
    weapons: ["buster", "dark_arrow"], // WEAPON_ORDER
    initialWeapon: "buster",
  },
} satisfies Record<string, LoadoutDefinition>;
