import { TILE_SIZE } from '../core/constants.js';

/**
 * Shrink applied to the max edge of an AABB before mapping it to a tile index,
 * so a body resting exactly on a tile boundary is not counted as inside it.
 * Every query below uses the same value, which is what lets swept resolution
 * place a body exactly on the boundary and stay non-overlapping.
 */
const SKIN = 0.001;

/** Result of a swept axis query. */
export interface Sweep {
  /** Resolved centre coordinate on the swept axis. */
  pos: number;
  /** True when a solid tile stopped the motion short of the target. */
  hit: boolean;
}

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
    const x0 = Math.floor((cx - hw) / TILE_SIZE);
    const x1 = Math.floor((cx + hw - SKIN) / TILE_SIZE);
    const y0 = Math.floor((cy - hh) / TILE_SIZE);
    const y1 = Math.floor((cy + hh - SKIN) / TILE_SIZE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (this.isSolidTile(tx, ty)) return true;
      }
    }
    return false;
  }

  /** Is any tile in column `tx`, rows `ty0..ty1`, solid? */
  private columnSolid(tx: number, ty0: number, ty1: number): boolean {
    for (let ty = ty0; ty <= ty1; ty++) if (this.isSolidTile(tx, ty)) return true;
    return false;
  }

  /** Is any tile in row `ty`, columns `tx0..tx1`, solid? */
  private rowSolid(ty: number, tx0: number, tx1: number): boolean {
    for (let tx = tx0; tx <= tx1; tx++) if (this.isSolidTile(tx, ty)) return true;
    return false;
  }

  /**
   * Sweep the AABB horizontally by `dx` and return where it comes to rest.
   *
   * Every tile column the leading edge crosses is tested, so no amount of speed
   * can tunnel through geometry, and a blocked body is placed exactly against
   * the blocking tile face rather than approximately (the old resolver stepped
   * back in 0.25px increments, leaving a variable sub-pixel gap).
   */
  sweepX(cx: number, cy: number, hw: number, hh: number, dx: number): Sweep {
    if (dx === 0) return { pos: cx, hit: false };
    const ty0 = Math.floor((cy - hh) / TILE_SIZE);
    const ty1 = Math.floor((cy + hh - SKIN) / TILE_SIZE);

    if (dx > 0) {
      const lead = cx + hw;
      const from = Math.floor((lead - SKIN) / TILE_SIZE);
      const to = Math.floor((lead + dx - SKIN) / TILE_SIZE);
      for (let tx = from; tx <= to; tx++) {
        if (this.columnSolid(tx, ty0, ty1)) return { pos: tx * TILE_SIZE - hw, hit: true };
      }
    } else {
      const lead = cx - hw;
      const from = Math.floor(lead / TILE_SIZE);
      const to = Math.floor((lead + dx) / TILE_SIZE);
      for (let tx = from; tx >= to; tx--) {
        if (this.columnSolid(tx, ty0, ty1)) {
          return { pos: (tx + 1) * TILE_SIZE + hw, hit: true };
        }
      }
    }
    return { pos: cx + dx, hit: false };
  }

  /** Vertical counterpart of {@link sweepX}. */
  sweepY(cx: number, cy: number, hw: number, hh: number, dy: number): Sweep {
    if (dy === 0) return { pos: cy, hit: false };
    const tx0 = Math.floor((cx - hw) / TILE_SIZE);
    const tx1 = Math.floor((cx + hw - SKIN) / TILE_SIZE);

    if (dy > 0) {
      const lead = cy + hh;
      const from = Math.floor((lead - SKIN) / TILE_SIZE);
      const to = Math.floor((lead + dy - SKIN) / TILE_SIZE);
      for (let ty = from; ty <= to; ty++) {
        if (this.rowSolid(ty, tx0, tx1)) return { pos: ty * TILE_SIZE - hh, hit: true };
      }
    } else {
      const lead = cy - hh;
      const from = Math.floor(lead / TILE_SIZE);
      const to = Math.floor((lead + dy) / TILE_SIZE);
      for (let ty = from; ty >= to; ty--) {
        if (this.rowSolid(ty, tx0, tx1)) return { pos: (ty + 1) * TILE_SIZE + hh, hit: true };
      }
    }
    return { pos: cy + dy, hit: false };
  }

  /**
   * Horizontal point cast for projectiles. Returns the x of the tile face that
   * stops the ray, or null when the whole span is clear. Point-sampling only the
   * endpoint (as before) let fast shots register their hit several pixels deep
   * inside the wall.
   */
  raycastX(x: number, y: number, dx: number): number | null {
    if (dx === 0) return this.isSolidAt(x, y) ? x : null;
    const ty = Math.floor(y / TILE_SIZE);
    const from = Math.floor(x / TILE_SIZE);
    const to = Math.floor((x + dx) / TILE_SIZE);
    if (dx > 0) {
      for (let tx = from; tx <= to; tx++) {
        if (this.isSolidTile(tx, ty)) return tx * TILE_SIZE;
      }
    } else {
      for (let tx = from; tx >= to; tx--) {
        if (this.isSolidTile(tx, ty)) return (tx + 1) * TILE_SIZE;
      }
    }
    return null;
  }
}
