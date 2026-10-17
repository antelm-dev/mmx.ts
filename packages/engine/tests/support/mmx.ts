import pack from "@mmx/pack-mmx-starter/data/game.json" with { type: "json" };

import { buildCompileRegistries } from "../../src/behaviors/index.js";
import { enemyStats, type EnemyStats } from "../../src/core/constants.js";
import {
  GAME_DATA,
  compileGameData,
  mergeGameData,
  type CompiledGameData,
  type GameData,
  type GameDataOverlay,
} from "../../src/data/index.js";
import type { Enemy } from "../../src/game/Enemy.js";
import type { World } from "../../src/game/World.js";
import { spawnEnemy } from "../../src/game/enemies/index.js";

/**
 * The MMX game data tests run on: the engine's core plus the MMX Starter pack,
 * passed explicitly so no test leans on the built-in default for an MMX object.
 */

export const MMX_PACK = pack as GameDataOverlay;

/** Compile `data` against the real registries, throwing on any diagnostic. */
export function compileStrict(data: GameData): CompiledGameData {
  const result = compileGameData(data, buildCompileRegistries());
  if (!result.ok || result.diagnostics.length > 0) {
    throw new Error(`game data failed to compile: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.value;
}

/** Core + the MMX Starter pack. */
export const MMX_GAME_DATA: GameData = (() => {
  const merged = mergeGameData(GAME_DATA, MMX_PACK);
  if (!merged.ok)
    throw new Error(`MMX pack failed to merge: ${JSON.stringify(merged.diagnostics)}`);
  return merged.value;
})();

export const MMX_COMPILED: CompiledGameData = compileStrict(MMX_GAME_DATA);

function make(id: string) {
  return (world: World, x: number, y: number, facing = -1, seed?: number): Enemy =>
    spawnEnemy(MMX_COMPILED.enemies.get(id)!, world, x, y, facing, seed, MMX_COMPILED);
}

/** Metool.tscn: the shielded ground enemy (Patrol, Hide on sight, Stun on guard break). */
export const makeMetool = make("metool");
/** SmallBat.tscn: the 1-health flier (Hover, Pursuit on sight, Recoil on touch). */
export const makeBat = make("bat");
/** Pantheon Hunter: Patrol, Shoot on sight, Stun when hit. */
export const makePantheon = make("pantheon");

/** The legacy stats shape of each pack enemy. */
export const ENEMY_STATS: Readonly<Record<"metool" | "bat" | "pantheon", EnemyStats>> = {
  metool: enemyStats(MMX_COMPILED.enemies.get("metool")!),
  bat: enemyStats(MMX_COMPILED.enemies.get("bat")!),
  pantheon: enemyStats(MMX_COMPILED.enemies.get("pantheon")!),
};

const pickup = (id: string) => MMX_COMPILED.pickups.get(id)!;

/** Heal.tscn / SmallHeal.tscn: sheet and heal amount. */
export const LIFE_CAPSULE_STATS = {
  small: { sheet: pickup("life.small").sheet, heal: pickup("life.small").amount },
  large: { sheet: pickup("life.large").sheet, heal: pickup("life.large").amount },
} as const;

/** SmallAmmo.tscn / Ammo.tscn: sheet and ammo amount. */
export const WEAPON_CAPSULE_STATS = {
  small: { sheet: pickup("weapon.small").sheet, ammo: pickup("weapon.small").amount },
  large: { sheet: pickup("weapon.large").sheet, ammo: pickup("weapon.large").amount },
} as const;
