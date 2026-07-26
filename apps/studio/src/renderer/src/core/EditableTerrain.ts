import {
  TerrainTile,
  type LevelDocument,
  type SlopeMap,
  type SlopeProfile,
} from "@mmx/content-schema";

export type EditableTerrainSource = Pick<
  LevelDocument,
  "cols" | "rows" | "gridSize" | "tiles" | "slopes"
>;

export class EditableTerrain {
  readonly cols: number;
  readonly rows: number;
  readonly gridSize: number;
  readonly tiles: readonly TerrainTile[];
  readonly slopes: SlopeMap | undefined;

  constructor(source: EditableTerrainSource) {
    this.cols = source.cols;
    this.rows = source.rows;
    this.gridSize = source.gridSize;
    this.tiles = source.tiles;
    this.slopes = source.slopes;
  }

  tileAt(col: number, row: number): TerrainTile {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) {
      return TerrainTile.Empty;
    }
    return this.tiles[row * this.cols + col] ?? TerrainTile.Empty;
  }

  slopeProfile(col: number, row: number, kind: TerrainTile): SlopeProfile {
    const index = row * this.cols + col;
    const authored = this.slopes?.[index];
    if (authored) return { l: authored[0], r: authored[1] };
    if (kind === TerrainTile.SlopeUpLeft) {
      return { l: this.gridSize, r: 0 };
    }
    return { l: 0, r: this.gridSize };
  }
}
