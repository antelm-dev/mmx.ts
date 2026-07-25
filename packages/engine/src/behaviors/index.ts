import type { CompileRegistries } from "../data/types.js";
import { abilityRegistry } from "./abilityRegistry.js";
import { enemyBehaviorRegistry } from "./enemyBehaviorRegistry.js";
import { projectileBehaviorRegistry } from "./projectileRegistry.js";
import { pickupEffectRegistry } from "./pickupRegistry.js";
import { environmentBehaviorRegistry } from "./environmentRegistry.js";
import { prefabRuntimeRegistry } from "./prefabRuntimeRegistry.js";
import { effectRegistry } from "./effectRegistry.js";

export * from "./types.js";
export * from "./geometryTypes.js";
export * from "./configValidation.js";
export { abilityRegistry, type AbilityFactory, type AbilityConfig } from "./abilityRegistry.js";
export { enemyBehaviorRegistry, type EnemyBehaviorFactory } from "./enemyBehaviorRegistry.js";
export { projectileBehaviorRegistry, type ProjectileBehaviorFactory } from "./projectileRegistry.js";
export { pickupEffectRegistry, type PickupEffectFactory } from "./pickupRegistry.js";
export { environmentBehaviorRegistry, type EnvironmentBehaviorFactory } from "./environmentRegistry.js";
export { prefabRuntimeRegistry, type PrefabRuntimeFactory } from "./prefabRuntimeRegistry.js";
export { effectRegistry, type EffectFactory } from "./effectRegistry.js";

/**
 * The engine's real behaviour registries, assembled into the
 * {@link CompileRegistries} shape {@link compileGameData} validates against.
 * Using these (rather than a hand-maintained id list) is what makes an unknown
 * behaviour id or a malformed ability config a compilation error.
 */
export function buildCompileRegistries(): CompileRegistries {
  return {
    abilities: abilityRegistry,
    enemyBehaviors: enemyBehaviorRegistry,
    projectiles: projectileBehaviorRegistry,
    pickups: pickupEffectRegistry,
    environments: environmentBehaviorRegistry,
    prefabRuntimes: prefabRuntimeRegistry,
    effects: effectRegistry,
  };
}
