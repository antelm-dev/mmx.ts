import { MMX_STARTER_PACK, withStarterPack } from "@mmx/content-schema";
import { buildCompileRegistries } from "@mmx/engine/behaviors";
import {
  GAME_DATA,
  compileGameData,
  mergeGameData,
  type GameData,
  type GameDataOverlay,
} from "@mmx/engine/data";

/** The MMX Starter, X and Zero packs as a project made from the template carries them: its data/game.json. */
export const MMX_OVERLAY: GameDataOverlay = withStarterPack({}, undefined).overlay!;

/** The X and Zero packs alone: the data/game.json of a project without the Starter's objects. */
export const PLAYERS_OVERLAY: GameDataOverlay = withStarterPack(
  { packs: [MMX_STARTER_PACK] },
  undefined,
).overlay!;

function merged(overlay: GameDataOverlay): GameData {
  const result = mergeGameData(GAME_DATA, overlay);
  if (!result.ok) throw new Error(`packs failed to merge: ${JSON.stringify(result.diagnostics)}`);
  return result.value;
}

/** The engine's core with the MMX Starter, X and Zero packs merged over it: an MMX project's game data. */
export const MMX_GAME_DATA: GameData = merged(MMX_OVERLAY);

/** The engine's core with only the X and Zero packs: a project without the Starter's objects. */
export const PLAYERS_GAME_DATA: GameData = merged(PLAYERS_OVERLAY);

/** Compile errors of `overlay` over `base` (none when it compiles). */
export function compileIssues(base: GameData, overlay: GameDataOverlay): string[] {
  const merged = mergeGameData(base, overlay);
  if (!merged.ok) return merged.diagnostics.map((d) => d.message);
  const compiled = compileGameData(merged.value, buildCompileRegistries());
  return compiled.ok ? [] : compiled.diagnostics.map((d) => d.message);
}
