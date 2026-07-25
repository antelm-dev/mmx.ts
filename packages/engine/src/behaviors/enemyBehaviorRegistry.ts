import { Registry, notWired, type BehaviorFactory } from "./types.js";
import { validateConfig } from "./configValidation.js";

/**
 * Enemy ability registry — distinct from the player {@link abilityRegistry}
 * because enemy abilities are a different class hierarchy (EnemyAbility) selected
 * by the AI event table rather than the player's priority race.
 *
 * The current enemy abilities take no data config (their tuning still lives in
 * constants — see the AI-timing constants), so each validates an empty config.
 * Part 6 wires the `create` bodies and may move that tuning into data.
 */
export type EnemyBehaviorFactory = BehaviorFactory<unknown, Record<string, unknown>, unknown>;

const ENEMY_BEHAVIOR_IDS = [
  "Patrol",
  "Hide",
  "Stun",
  "Death",
  "Hover",
  "Pursuit",
  "Recoil",
] as const;

export const enemyBehaviorRegistry = new Registry<EnemyBehaviorFactory>();

for (const id of ENEMY_BEHAVIOR_IDS) {
  enemyBehaviorRegistry.register({
    id,
    validate: (input) => validateConfig({}, input),
    create: () => notWired(id, "Part 6 (Enemy definitions)"),
  });
}
