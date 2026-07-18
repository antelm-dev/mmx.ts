import type { Tile } from './World.js';

/** An entity placed on an LDtk Entities layer, in world pixels. */
export interface LevelEntity {
  /** The LDtk entity identifier, e.g. 'Spawn'. */
  id: string;
  x: number;
  y: number;
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
  entities: LevelEntity[];
}
