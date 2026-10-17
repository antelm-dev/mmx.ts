import { withStarterPack } from "@mmx/content-schema";
import { buildCompileRegistries } from "@mmx/engine/behaviors";
import {
  GAME_DATA,
  compileGameData,
  mergeGameData,
  type GameData,
  type GameDataOverlay,
} from "@mmx/engine/data";

/** The MMX Starter pack as a project made from the template carries it: its data/game.json. */
export const MMX_OVERLAY: GameDataOverlay = withStarterPack({}, undefined).overlay!;

/** The engine's core with the MMX Starter pack merged over it: an MMX project's game data. */
export const MMX_GAME_DATA: GameData = (() => {
  const merged = mergeGameData(GAME_DATA, MMX_OVERLAY);
  if (!merged.ok)
    throw new Error(`MMX pack failed to merge: ${JSON.stringify(merged.diagnostics)}`);
  return merged.value;
})();

/** Compile errors of `overlay` over `base` (none when it compiles). */
export function compileIssues(base: GameData, overlay: GameDataOverlay): string[] {
  const merged = mergeGameData(base, overlay);
  if (!merged.ok) return merged.diagnostics.map((d) => d.message);
  const compiled = compileGameData(merged.value, buildCompileRegistries());
  return compiled.ok ? [] : compiled.diagnostics.map((d) => d.message);
}
