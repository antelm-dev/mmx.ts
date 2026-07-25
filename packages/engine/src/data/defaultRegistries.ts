import type { BehaviorValidatorSet, CompileRegistries } from "./types.js";

/**
 * A minimal {@link CompileRegistries} that knows only the set of behaviour ids
 * the default game data references. It lets {@link compileGameData} validate the
 * default content without depending on the runtime behaviour registries (Part 4),
 * which supersede this by exposing the same ids through real BehaviorFactories.
 *
 * The ids listed here are the contract: a runtime registry that drops one of
 * them would fail compilation, which is the point.
 */
function idSet(ids: readonly string[]): BehaviorValidatorSet {
  const set = new Set(ids);
  return { has: (id) => set.has(id) };
}

export const DEFAULT_COMPILE_REGISTRIES: CompileRegistries = {
  abilities: idSet([
    "player.idle",
    "player.walk",
    "player.fall",
    "player.wall-slide",
    "player.dash",
    "player.air-dash",
    "player.jump",
    "player.dash-jump",
    "player.wall-jump",
    "player.dash-wall-jump",
    "player.intro",
    "player.damage",
    "player.death",
    "player.shot",
    "player.charge",
  ]),
  enemyBehaviors: idSet(["Patrol", "Hide", "Stun", "Death", "Hover", "Pursuit", "Recoil"]),
  projectiles: idSet(["projectile.straight"]),
  pickups: idSet(["pickup.life", "pickup.weapon-energy"]),
  environments: idSet([
    "environment.moving-platform",
    "environment.conveyor",
    "environment.hazard",
    "environment.camera-zone",
  ]),
  prefabRuntimes: idSet(["spawn.player", "enemy", "pickup", "environment", "camera"]),
  effects: idSet(["enemy.reanchor-hover"]),
};
