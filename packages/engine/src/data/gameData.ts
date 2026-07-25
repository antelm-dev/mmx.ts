import type { GameData } from "./types.js";
import { physics } from "./physics.js";
import { actors } from "./actors.js";
import { abilities } from "./abilities.js";
import { loadouts } from "./loadouts.js";
import { enemies } from "./enemies.js";
import { weapons } from "./weapons.js";
import { projectiles } from "./projectiles.js";
import { pickups } from "./pickups.js";
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
 * The default MMX game data — the single source the compat constants and the
 * runtime both read from. Assembled from the per-category modules under this
 * directory rather than written inline, so a category can be authored in
 * isolation.
 */
export const GAME_DATA: GameData = defineGameData({
  schemaVersion: GAME_SCHEMA_VERSION,
  gameVersion: "1.0.0",
  physics,
  actors,
  abilities,
  loadouts,
  enemies,
  weapons,
  projectiles,
  pickups,
  environments,
  prefabs,
});
