import type { SlopeMap, Tile } from "./World.js";

/** An entity placed on an LDtk Entities layer, in world pixels. */
export interface LevelEntity {
  /** The LDtk entity identifier, e.g. 'Spawn'. */
  id: string;
  x: number;
  y: number;
  /**
   * The instance's box, in world pixels. Point-like entities keep their
   * definition's default size; resizable ones (CameraZone) carry whatever the
   * author dragged out in the editor, which is the whole content of the entity.
   */
  w: number;
  h: number;
  /** Custom LDtk fields, keyed by field identifier. */
  fields: Record<string, unknown>;
}

/**
 * The engine-facing shape of a level: what survives the LDtk import in
 * tools/import-ldtk.mjs. Modules matching this are generated into ./levels/.
 */
export interface LevelData {
  identifier: string;
  gridSize: number;
  cols: number;
  rows: number;
  /** Row-major, length cols * rows. */
  tiles: Tile[];
  /**
   * Ramp shapes for the slope tiles that are not 45 degrees, baked out of the
   * level's Slope entities by tools/import-ldtk.mjs. Absent when every ramp in
   * the level is a plain diagonal.
   */
  slopes?: SlopeMap;
  entities: LevelEntity[];
}
