import type { SlopeMap, TerrainTile } from "@mmx/contracts/terrain";

/** An authored entity placed in a level, in world pixels. */
export interface LevelEntity {
  /** The engine entity identifier, e.g. 'Spawn'. */
  id: string;
  /** Stable authored instance identifier, unique within the project. */
  iid: string;
  x: number;
  y: number;
  /**
   * The instance's box, in world pixels. Point-like entities keep their
   * definition's default size; resizable ones (CameraZone) carry whatever the
   * author dragged out in the editor, which is the whole content of the entity.
   */
  w: number;
  h: number;
  /** Custom fields, keyed by field identifier. */
  fields: Record<string, unknown>;
}

/**
 * The engine-facing shape of a level. Studio project documents are compiled
 * into this runtime shape by
 * `@mmx/build-tools`.
 */
export interface LevelData {
  identifier: string;
  gridSize: number;
  cols: number;
  rows: number;
  /** Row-major, length cols * rows. Values are {@link TerrainTile}. */
  tiles: TerrainTile[];
  /**
   * Ramp shapes for the slope tiles that are not 45 degrees, baked out of the
   * level's Slope objects by the project compiler. Absent when every ramp in
   * the level is a plain diagonal.
   */
  slopes?: SlopeMap;
  entities: LevelEntity[];
}
