import { TerrainTile, type SlopeMap, type SlopeProfile } from "@mmx/contracts/terrain";

export { TerrainTile, type SlopeMap, type SlopeProfile };

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
