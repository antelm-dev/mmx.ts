/**
 * Serializable terrain cell kinds. Numeric values are part of the on-disk
 * level format and must not change.
 */
export const TerrainTile = {
  Empty: 0,
  Solid: 1,
  SlopeUpRight: 2,
  SlopeUpLeft: 3,
} as const;

export type TerrainTile = (typeof TerrainTile)[keyof typeof TerrainTile];

/**
 * How much of a slope tile is filled at each vertical edge, in pixels from the
 * tile's base. The surface between them is a straight line.
 */
export interface SlopeProfile {
  l: number;
  r: number;
}

/**
 * Slope profiles keyed by row-major tile index, as `[left, right]`.
 */
export type SlopeMap = Record<number, [number, number]>;
