import { Registry, notWired, type BehaviorFactory } from "./types.js";
import { validateConfig, type Schema } from "./configValidation.js";

/**
 * The player-ability registry. Each entry validates the exact config its ability
 * class consumes (the keys authored in data/abilities.ts) and — from Part 5 —
 * creates the ability instance from that validated config. The `create` bodies
 * are placeholders until Part 5 wires the Player loadout.
 *
 * Owner/result are `unknown` here to avoid coupling the registry to the runtime
 * ability classes (which transitively import constants); Part 5 narrows them.
 */
export type AbilityConfig = Record<string, unknown>;
export type AbilityFactory = BehaviorFactory<unknown, AbilityConfig, unknown>;

/**
 * Config contract per player ability behaviour. Kept in one table so it reads as
 * the counterpart to data/abilities.ts — every key here must appear there and
 * vice versa, or compilation fails (unknown/missing key).
 */
const ABILITY_SCHEMAS: Readonly<Record<string, Schema>> = {
  "player.idle": {},
  "player.walk": { speed: "number" },
  "player.fall": { dashFallSpeed: "number" },
  "player.wall-slide": { speed: "number", startDelay: "number" },
  "player.dash": { speed: "number", duration: "number", leeway: "number" },
  "player.air-dash": { speed: "number", duration: "number", maxAirdashes: "number" },
  "player.jump": { velocity: "number", maxTime: "number", leeway: "number", fullspeedProportion: "number" },
  "player.dash-jump": { speed: "number", dashDuration: "number" },
  "player.wall-jump": { startDelay: "number", moveawayDuration: "number", moveawaySpeed: "number" },
  "player.dash-wall-jump": {},
  "player.intro": { dropHeight: "number", beamSpeed: "number", thunderWindow: "tuple2" },
  "player.damage": { duration: "number", invulnerability: "number", knockbackSpeed: "number", knockbackJumpVelocity: "number" },
  "player.death": { restartDelay: "number" },
  "player.shot": { armPointDuration: "number" },
  "player.charge": { minTime: "number", level3: "number", level4: "number", maxTime: "number" },
};

export const abilityRegistry = new Registry<AbilityFactory>();

for (const [id, schema] of Object.entries(ABILITY_SCHEMAS)) {
  abilityRegistry.register({
    id,
    validate: (input) => validateConfig<AbilityConfig>(schema, input),
    create: () => notWired(id, "Part 5 (Player loadout)"),
  });
}
