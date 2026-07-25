import { Registry, notWired, type BehaviorFactory } from "./types.js";
import type { PickupDefinition } from "../data/types.js";

/**
 * Pickup effect registry. The tick-heal / tick-refill algorithms stay in code
 * (Pickup.ts); an entry names which one a pickup runs. Part 8 wires `create`.
 */
export type PickupEffectFactory = BehaviorFactory<unknown, PickupDefinition, unknown>;

const PICKUP_EFFECT_IDS = ["pickup.life", "pickup.weapon-energy"] as const;

export const pickupEffectRegistry = new Registry<PickupEffectFactory>();

for (const id of PICKUP_EFFECT_IDS) {
  pickupEffectRegistry.register({
    id,
    validate: (input) =>
      typeof input === "object" && input !== null
        ? { ok: true, value: input as PickupDefinition }
        : { ok: false, issues: [{ message: "pickup config must be an object." }] },
    create: () => notWired(id, "Part 8 (Pickups & environment)"),
  });
}
