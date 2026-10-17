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
 * (the Studio enemy editor) can build forms from it; every required key here
 * must appear in an enemy's `abilityConfig` entry, and every key there must be
 * declared here, or compilation fails.
 * Times are seconds, distances pixels, speeds pixels per second.
 */
export const ENEMY_BEHAVIOR_SCHEMAS = {
  // Each `default` is what Studio seeds a new ability with: the first built-in enemy's tuning
  // (Metool, Bat, Pantheon Hunter), so Studio no longer reads those enemies for it.
  Patrol: {
    travelSpeed: { type: "number", min: 0, default: 25 },
    travelTime: { type: "number", min: 0, default: 0.8 },
    /** Each rest lasts restMin plus a random [0, 1) s. */
    restMin: { type: "number", min: 0, default: 0.8 },
    randomTurn: { type: "boolean", default: false },
    conflicts: { type: "string[]", default: ["Hide", "Stun"] },
  },
  Hide: {
    openDelay: { type: "number", min: 0, default: 3 },
    advanceRangeX: { type: "number", min: 0, default: 64 },
    advanceRangeY: { type: "number", min: 0, default: 16 },
    giveUpRangeX: { type: "number", min: 0, default: 80 },
    reshieldDelay: { type: "number", min: 0, default: 0.1 },
    speed: { type: "number", min: 0, default: 90 },
  },
  Stun: {
    duration: { type: "number", min: 0, default: 1.65 },
    animation: { type: "string", default: "stun" },
    /** Clip played once the stun elapses; "" waits on the stun clip instead. */
    recoverAnimation: { type: "string", default: "" },
    reactivateShield: { type: "boolean", default: false },
    gravity: { type: "boolean", default: true },
    conflicts: { type: "string[]", default: [] },
  },
  Hover: {
    area: { type: "number", min: 1, default: 16 },
    travelTime: { type: "number", min: ONE_TICK, default: 0.5 },
    restDuration: { type: "number", min: 0, default: 0.5 },
  },
  Pursuit: {
    speed: { type: "number", min: 0, default: 80 },
    giveUpDistance: { type: "number", min: 0, default: 200 },
    weaveRate: { type: "number", min: 0, default: 4 },
  },
  Recoil: {
    speed: { type: "number", min: 0, default: 200 },
    duration: { type: "number", min: ONE_TICK, default: 0.7 },
  },
  Shoot: {
    /**
     * A projectile id; compilation checks it against the projectile table.
     * shortcut: defaults to the MMX Starter's shot, which Studio swaps for one the project has
     * when it is missing; drop the default once a base projectile exists.
     */
    projectile: { type: "string", default: "pantheon_shot" },
    cooldown: { type: "number", min: 0, default: 100 / 60 },
    recoverTime: { type: "number", min: 0, default: 24 / 60 },
  },
  Death: {
    explosionDuration: { type: "number", min: 0, default: 0 },
    /** Health at or below which the weak phase starts; 0 or absent never starts it. */
    weakHealth: { type: "number", min: 0, optional: true },
    /** Clip the weak phase plays; absent or "" keeps the current one. */
    weakAnimation: { type: "string", optional: true },
    /** Seconds the weak phase lasts before the enemy self-destructs. */
    weakDuration: { type: "number", min: 0, optional: true },
  },
  Roll: {
    speed: { type: "number", min: 0, default: 60 },
    facePlayer: { type: "boolean", default: true },
    atWall: { type: "string", options: ["turn", "stop"], default: "turn" },
    /** Stun must interrupt the roll, or the enemy rolls on through it. */
    conflicts: { type: "string[]", default: ["Stun"] },
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
