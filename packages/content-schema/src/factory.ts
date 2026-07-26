import { newId } from "./ids.js";
import { TerrainTile } from "./terrain.js";
import { SCHEMA_VERSION } from "./types.js";
import type { LevelDocument } from "./types.js";

/**
 * A blank, immediately-playable level: an empty grid with a solid floor along the
 * bottom row and exactly one Spawn resting on it. Keeping the Spawn here (rather
 * than leaving the document without one) means a freshly created level passes
 * {@link import("./validation.js").validateDocument} and can enter Play mode with
 * no further editing.
 */

export interface NewLevelOptions {
  name?: string;
  gridSize?: number;
  cols?: number;
  rows?: number;
}

/** Build a fresh, valid {@link LevelDocument} for "New Level". */
export function createLevelDocument(options: NewLevelOptions = {}): LevelDocument {
  const name = options.name?.trim() || "Untitled Level";
  const gridSize = options.gridSize ?? 16;
  const cols = options.cols ?? 40;
  const rows = options.rows ?? 23;

  const tiles = new Array<number>(cols * rows).fill(TerrainTile.Empty);
  const floorRow = rows - 1;
  for (let col = 0; col < cols; col++) tiles[floorRow * cols + col] = TerrainTile.Solid;

  // Spawn sitting on the floor, a couple of cells in from the left.
  const spawn = {
    id: newId(),
    definitionId: "spawn",
    x: gridSize * 2,
    y: (floorRow - 1) * gridSize,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    id: newId(),
    name,
    gridSize,
    cols,
    rows,
    tiles,
    objects: [spawn],
  };
}
