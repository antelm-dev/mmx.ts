import pack from "@mmx/pack-mmx-starter/data/game.json" with { type: "json" };
import { Tile, type LevelData } from "@mmx/engine";
import { buildCompileRegistries } from "@mmx/engine/behaviors";
import {
  GAME_DATA,
  compileGameData,
  mergeGameData,
  type CompiledGameData,
  type GameDataOverlay,
} from "@mmx/engine/data";

/** The engine's data with the MMX Starter pack over it: what testLevel's Metool needs. */
export const MMX_COMPILED: CompiledGameData = (() => {
  const merged = mergeGameData(GAME_DATA, pack as GameDataOverlay);
  const compiled = merged.ok && compileGameData(merged.value, buildCompileRegistries());
  if (!compiled || !compiled.ok) throw new Error("the MMX Starter pack failed to compile");
  return compiled.value;
})();

export function testLevel(): LevelData {
  const cols = 32;
  const rows = 16;
  const tiles = new Array<Tile>(cols * rows).fill(Tile.Empty);
  for (let col = 0; col < cols; col++) tiles[(rows - 1) * cols + col] = Tile.Solid;
  return {
    identifier: "renderer-test",
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
      {
        id: "Enemy",
        iid: "enemy",
        x: 128,
        y: (rows - 2) * 16,
        w: 16,
        h: 16,
        fields: { Kind: "metool", FacesRight: false },
      },
    ],
  };
}
