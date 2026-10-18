import xPack from "@mmx/pack-mmx-player-x/data/game.json" with { type: "json" };
import { Tile, type LevelData } from "@mmx/engine";
import { buildCompileRegistries } from "@mmx/engine/behaviors";
import {
  GAME_DATA,
  compileGameData,
  mergeGameData,
  type CompiledGameData,
  type GameDataOverlay,
} from "@mmx/engine/data";

/** The engine's core + the X pack: the engine ships no player, so the tests bring X. */
export const TEST_GAME_DATA: CompiledGameData = (() => {
  const merged = mergeGameData(GAME_DATA, xPack as GameDataOverlay);
  if (!merged.ok) throw new Error(JSON.stringify(merged.diagnostics));
  const compiled = compileGameData(merged.value, buildCompileRegistries());
  if (!compiled.ok) throw new Error(JSON.stringify(compiled.diagnostics));
  return compiled.value;
})();

export function testLevel(): LevelData {
  const cols = 32;
  const rows = 16;
  const tiles = new Array<Tile>(cols * rows).fill(Tile.Empty);
  for (let col = 0; col < cols; col++) tiles[(rows - 1) * cols + col] = Tile.Solid;
  return {
    identifier: "runtime-test",
    gridSize: 16,
    cols,
    rows,
    tiles,
    entities: [
      {
        id: "Spawn",
        iid: "spawn",
        x: 32,
        y: (rows - 2) * 16,
        w: 16,
        h: 16,
        fields: {},
      },
    ],
  };
}
