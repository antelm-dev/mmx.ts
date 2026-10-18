import pack from "@mmx/pack-mmx-starter/data/game.json" with { type: "json" };
import xPack from "@mmx/pack-mmx-player-x/data/game.json" with { type: "json" };
import zeroPack from "@mmx/pack-mmx-player-zero/data/game.json" with { type: "json" };

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
import type { Input } from "../../src/core/Input.js";
import type { Enemy } from "../../src/game/Enemy.js";
import { Player } from "../../src/game/Player.js";
import type { World } from "../../src/game/World.js";
import { spawnEnemy } from "../../src/game/enemies/index.js";

/**
 * The MMX game data tests run on: the engine's core plus the MMX Starter, X and
 * Zero packs, passed explicitly so no test leans on the built-in default for an
 * MMX object or a player.
 */

export const MMX_PACK = pack as GameDataOverlay;
export const X_PACK = xPack as GameDataOverlay;
export const ZERO_PACK = zeroPack as GameDataOverlay;

/** Compile `data` against the real registries, throwing on any diagnostic. */
export function compileStrict(data: GameData): CompiledGameData {
  const result = compileGameData(data, buildCompileRegistries());
  if (!result.ok || result.diagnostics.length > 0) {
    throw new Error(`game data failed to compile: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.value;
}

/** `base` with each pack merged over it in order, as a project's packs are. */
export function withPacks(base: GameData, ...packs: GameDataOverlay[]): GameData {
  return packs.reduce((data, overlay) => {
    const merged = mergeGameData(data, overlay);
    if (!merged.ok) throw new Error(`pack failed to merge: ${JSON.stringify(merged.diagnostics)}`);
    return merged.value;
  }, base);
}

/** Core + the MMX Starter, X and Zero packs. */
export const MMX_GAME_DATA: GameData = withPacks(GAME_DATA, MMX_PACK, X_PACK, ZERO_PACK);

export const MMX_COMPILED: CompiledGameData = compileStrict(MMX_GAME_DATA);

/** A player built from `loadoutId` (X by default) in the MMX game data. */
export function createPlayer(
  world: World,
  x: number,
  y: number,
  input: Input,
  seed?: number,
  loadoutId = "player.x",
  gameData: CompiledGameData = MMX_COMPILED,
): Player {
  return new Player(world, x, y, input, seed, loadoutId, gameData);
}

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
