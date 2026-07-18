import { TILE_SIZE } from '../core/constants.js';

/**
 * A simple solid-tile world with AABB collision + sensor queries.
 *
 * This replaces Godot's move_and_slide() + RayCast2D nodes. The Godot project
 * detected walls/walljump-reach with columns of raycasts (Character.gd cast_left/
 * cast_right/jumpcast_*); here we sample solid tiles along the body edges instead,
 * which produces equivalent -1 / 0 / +1 results.
 */
export class World {
  readonly cols: number;
  readonly rows: number;
  private solid: boolean[]; // row-major

  constructor(rows: string[]) {
    this.rows = rows.length;
    this.cols = Math.max(...rows.map((r) => r.length));
    this.solid = new Array(this.cols * this.rows).fill(false);
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        if (rows[y][x] === '#') this.solid[y * this.cols + x] = true;
      }
    }
  }

  get widthPx(): number {
    return this.cols * TILE_SIZE;
  }
  get heightPx(): number {
    return this.rows * TILE_SIZE;
  }

  isSolidTile(cx: number, cy: number): boolean {
    if (cx < 0 || cx >= this.cols || cy < 0 || cy >= this.rows) return cx < 0 || cx >= this.cols; // walls on horizontal edges, open top/bottom
    return this.solid[cy * this.cols + cx];
  }

  /** Is world-space point inside a solid tile? */
  isSolidAt(px: number, py: number): boolean {
    return this.isSolidTile(Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE));
  }

  /** Does the AABB (center cx,cy, half hw,hh) overlap any solid tile? */
  overlaps(cx: number, cy: number, hw: number, hh: number): boolean {
    const left = cx - hw;
    const right = cx + hw;
    const top = cy - hh;
    const bottom = cy + hh;
    const x0 = Math.floor(left / TILE_SIZE);
    const x1 = Math.floor((right - 0.001) / TILE_SIZE);
    const y0 = Math.floor(top / TILE_SIZE);
    const y1 = Math.floor((bottom - 0.001) / TILE_SIZE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.isSolidTile(tx, ty)) return true;
      }
    }
    return false;
  }
}
