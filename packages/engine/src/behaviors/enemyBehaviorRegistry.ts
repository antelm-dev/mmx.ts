import { Registry, notWired, type BehaviorFactory } from "./types.js";
import { validateConfig, type Schema } from "./configValidation.js";

/**
 * Enemy ability registry — distinct from the player {@link abilityRegistry}
 * because enemy abilities are a different class hierarchy (EnemyAbility) selected
 * by the AI event table rather than the player's priority race.
 *
 * Each entry validates the exact tuning its ability class consumes, authored
 * per enemy in data/enemies.ts `abilityConfig`. The `create` bodies are attached
 * by game/enemies, where the ability classes live.
 */
export type EnemyBehaviorConfig = Record<string, unknown>;
export type EnemyBehaviorFactory = BehaviorFactory<unknown, EnemyBehaviorConfig, unknown>;

/** Durations that divide a tick's progress must span at least one 60 Hz tick. */
const ONE_TICK = 1 / 60;

/**
 * Config contract per enemy ability, keyed by ability id. Exported so tooling
 * (the Studio enemy editor) can build forms from it; every key here must appear
 * in an enemy's `abilityConfig` entry and vice versa, or compilation fails.
 * Times are seconds, distances pixels, speeds pixels per second.
 */
export const ENEMY_BEHAVIOR_SCHEMAS = {
  Patrol: {
    travelSpeed: { type: "number", min: 0 },
    travelTime: { type: "number", min: 0 },
    /** Each rest lasts restMin plus a random [0, 1) s. */
    restMin: { type: "number", min: 0 },
    randomTurn: "boolean",
    conflicts: "string[]",
  },
  Hide: {
    openDelay: { type: "number", min: 0 },
    advanceRangeX: { type: "number", min: 0 },
    advanceRangeY: { type: "number", min: 0 },
    giveUpRangeX: { type: "number", min: 0 },
    reshieldDelay: { type: "number", min: 0 },
    speed: { type: "number", min: 0 },
  },
  Stun: {
    duration: { type: "number", min: 0 },
    animation: "string",
    /** Clip played once the stun elapses; "" waits on the stun clip instead. */
    recoverAnimation: "string",
    reactivateShield: "boolean",
    gravity: "boolean",
    conflicts: "string[]",
  },
  Hover: {
    area: { type: "number", min: 1 },
    travelTime: { type: "number", min: ONE_TICK },
    restDuration: { type: "number", min: 0 },
  },
  Pursuit: {
    speed: { type: "number", min: 0 },
    giveUpDistance: { type: "number", min: 0 },
    weaveRate: { type: "number", min: 0 },
  },
  Recoil: {
    speed: { type: "number", min: 0 },
    duration: { type: "number", min: ONE_TICK },
  },
  Shoot: {
    /** A projectile id; compilation checks it against the projectile table. */
    projectile: "string",
    cooldown: { type: "number", min: 0 },
    recoverTime: { type: "number", min: 0 },
  },
  Death: {
    explosionDuration: { type: "number", min: 0 },
  },
  Roll: {
    speed: { type: "number", min: 0, default: 60 },
    facePlayer: { type: "boolean", default: true },
    atWall: { type: "string", options: ["turn", "stop"], default: "turn" },
    conflicts: "string[]",
  },
} as const satisfies Readonly<Record<string, Schema>>;

export type EnemyBehaviorId = keyof typeof ENEMY_BEHAVIOR_SCHEMAS;

export const enemyBehaviorRegistry = new Registry<EnemyBehaviorFactory>();

for (const [id, schema] of Object.entries(ENEMY_BEHAVIOR_SCHEMAS)) {
  enemyBehaviorRegistry.register({
    id,
    validate: (input) => validateConfig<EnemyBehaviorConfig>(schema, input),
    create: () => notWired(id, "game/enemies"),
  });
}
