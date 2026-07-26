/**
 * Stable, serializable terrain values stored in {@link LevelDocument.tiles}.
 *
 * Numerically identical to the engine's `Tile` enum so existing JSON stays
 * compatible, but this package never imports the engine — the engine adapter
 * maps these values explicitly when building runtime `LevelData`.
 */
export const TerrainTile = {
  Empty: 0,
  Solid: 1,
  SlopeUpRight: 2,
  SlopeUpLeft: 3,
} as const;

export type TerrainTile = (typeof TerrainTile)[keyof typeof TerrainTile];

/** Tile-name strings used by the pure slope baker. */
export const TERRAIN_TILE_NAME: Record<TerrainTile, string> = {
  [TerrainTile.Empty]: "Empty",
  [TerrainTile.Solid]: "Solid",
  [TerrainTile.SlopeUpRight]: "SlopeUpRight",
  [TerrainTile.SlopeUpLeft]: "SlopeUpLeft",
};

export const TERRAIN_TILE_BY_NAME: Record<string, TerrainTile> = {
  Empty: TerrainTile.Empty,
  Solid: TerrainTile.Solid,
  SlopeUpRight: TerrainTile.SlopeUpRight,
  SlopeUpLeft: TerrainTile.SlopeUpLeft,
};
