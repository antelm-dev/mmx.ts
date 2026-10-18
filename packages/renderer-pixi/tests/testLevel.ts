import pack from "@mmx/pack-mmx-starter/data/game.json" with { type: "json" };
import xPack from "@mmx/pack-mmx-player-x/data/game.json" with { type: "json" };
import zeroPack from "@mmx/pack-mmx-player-zero/data/game.json" with { type: "json" };
import { Tile, type LevelData } from "@mmx/engine";
import { buildCompileRegistries } from "@mmx/engine/behaviors";
import {
  GAME_DATA,
  compileGameData,
  mergeGameData,
  type CompiledGameData,
  type GameDataOverlay,
} from "@mmx/engine/data";

/** The engine's data with the MMX Starter, X and Zero packs over it: testLevel's Metool and player. */
export const MMX_COMPILED: CompiledGameData = (() => {
  let data = GAME_DATA;
  for (const overlay of [pack, xPack, zeroPack]) {
    const merged = mergeGameData(data, overlay as GameDataOverlay);
    if (!merged.ok) throw new Error("an MMX pack failed to merge");
    data = merged.value;
  }
  const compiled = compileGameData(data, buildCompileRegistries());
  if (!compiled.ok) throw new Error("the MMX packs failed to compile");
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
