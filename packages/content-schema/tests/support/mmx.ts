import pack from "@mmx/pack-mmx-starter/data/game.json" with { type: "json" };
import { GAME_DATA, mergeGameData, type GameData, type GameDataOverlay } from "@mmx/engine/data";

/** The engine's core plus the MMX Starter pack: the data an MMX project's catalog comes from. */
export const MMX_GAME_DATA: GameData = (() => {
  const merged = mergeGameData(GAME_DATA, pack as GameDataOverlay);
  if (!merged.ok)
    throw new Error(`MMX pack failed to merge: ${JSON.stringify(merged.diagnostics)}`);
  return merged.value;
})();
