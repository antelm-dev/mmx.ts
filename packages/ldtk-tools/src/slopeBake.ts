import {
  applySlopes,
  bakeSlope,
  TILE,
  type BakedTile,
  type SlopeMap,
  type SlopeProfile,
  type SlopeRect,
} from "@mmx/slope-tools";

export { applySlopes, bakeSlope, TILE };
export type { BakedTile, SlopeMap, SlopeProfile, SlopeRect };

/** The engine-facing shape of an entity, as the LDtk importer produces it. */
export interface LevelEntityLike {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fields: Record<string, unknown>;
}

/**
 * Read the Slope rectangles out of a level's entity list (the shape
 * the LDtk importer produces: id, x, y, w, h, fields).
 */
export function slopeRects(entities: LevelEntityLike[]): SlopeRect[] {
  return entities
    .filter((e) => e.id === "Slope")
    .map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h, dir: String(e.fields.Dir) }));
}
