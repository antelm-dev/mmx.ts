import type { GameData } from "./types.js";
import { physics } from "./physics.js";
import { environments } from "./environments.js";
import { prefabs } from "./prefabs.js";

export const GAME_SCHEMA_VERSION = 1;

/**
 * Identity helper that pins the authored shape to {@link GameData}. Authoring a
 * variant game is `defineGameData({ ...GAME_DATA, enemies: { ... } })` — the type
 * checker enforces the contract; nothing is computed here.
 */
export function defineGameData(data: GameData): GameData {
  return data;
}

/**
 * The engine's core game data: physics and the level primitives (spawn, hazard,
 * camera zone). Players, their abilities, weapons and shots, enemies, pickups,
 * platforms and conveyors are project data, merged over this as an overlay: the
 * X and Zero packs (`@mmx/pack-mmx-player-x`, `@mmx/pack-mmx-player-zero`) and the
 * MMX Starter pack (`@mmx/pack-mmx-starter`) are the MMX set.
 */
export const GAME_DATA: GameData = defineGameData({
  schemaVersion: GAME_SCHEMA_VERSION,
  gameVersion: "1.0.0",
  physics,
  actors: {},
  abilities: {},
  loadouts: {},
  enemies: {},
  weapons: {},
  projectiles: {},
  pickups: {},
  environments,
  prefabs,
});
