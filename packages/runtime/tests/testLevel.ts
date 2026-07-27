import { Tile, type LevelData } from "@mmx/engine";

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
