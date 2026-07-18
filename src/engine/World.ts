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
 * Tile kinds. Slopes are 45-degree ramps filling the half of the tile below the
 * diagonal: `SlopeUpRight` ('/') is empty at its left edge and full height at
 * its right edge, `SlopeUpLeft` ('\') the mirror.
 */
export enum Tile {
  Empty = 0,
  Solid = 1,
  SlopeUpRight = 2,
  SlopeUpLeft = 3,
}

const CHAR_TO_TILE: Record<string, Tile> = {
  '#': Tile.Solid,
  '/': Tile.SlopeUpRight,
  '\\': Tile.SlopeUpLeft,
};

function isSlope(t: Tile): boolean {
  return t === Tile.SlopeUpRight || t === Tile.SlopeUpLeft;
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
  private readonly tiles: Tile[]; // row-major

  /**
   * Takes an already-decoded row-major grid. Parsing lives outside so that a
   * level format (see the LDtk import under tools/) can produce tiles directly
   * instead of round-tripping through the ASCII characters below.
   */
  constructor(tiles: Tile[], cols: number, rows: number) {
    if (tiles.length !== cols * rows) {
      throw new Error(`World: expected ${cols * rows} tiles, got ${tiles.length}`);
    }
    this.cols = cols;
    this.rows = rows;
    this.tiles = tiles;
  }

  /**
   * Build from the ASCII form. Rows may be ragged; short ones are padded with
   * empty, which keeps hand-written test fixtures from having to line up.
   */
  static fromRows(rows: string[]): World {
    const cols = Math.max(...rows.map((r) => r.length));
    const tiles: Tile[] = new Array(cols * rows.length).fill(Tile.Empty);
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        tiles[y * cols + x] = CHAR_TO_TILE[rows[y][x]] ?? Tile.Empty;
      }
    }
    return new World(tiles, cols, rows.length);
  }

  get widthPx(): number {
    return this.cols * TILE_SIZE;
  }
  get heightPx(): number {
    return this.rows * TILE_SIZE;
  }

  /** Tile kind at a grid coordinate; out of bounds is solid left/right, open top/bottom. */
  tileAt(cx: number, cy: number): Tile {
    if (cx < 0 || cx >= this.cols || cy < 0 || cy >= this.rows) {
      return cx < 0 || cx >= this.cols ? Tile.Solid : Tile.Empty;
    }
    return this.tiles[cy * this.cols + cx];
  }

  /**
   * Full-height blocking tile. Slopes are deliberately excluded: the swept
   * resolvers treat a ramp as passable and the body is lifted onto its surface
   * afterwards (see {@link slopeFloorY}), which is what makes walking up a ramp
   * work instead of stopping dead against its foot.
   */
  isSolidTile(cx: number, cy: number): boolean {
    return this.tileAt(cx, cy) === Tile.Solid;
  }

  /** Is world-space point inside a solid tile? */
  isSolidAt(px: number, py: number): boolean {
    return this.isSolidTile(Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE));
  }

  /**
   * World y of a slope tile's surface at world x, clamped to the tile's span.
   * Points at or below this y (and inside the tile) are inside the ramp.
   */
  slopeSurfaceY(tx: number, ty: number, kind: Tile, worldX: number): number {
    const lx = Math.min(TILE_SIZE, Math.max(0, worldX - tx * TILE_SIZE));
    const fill = kind === Tile.SlopeUpRight ? lx : TILE_SIZE - lx;
    return (ty + 1) * TILE_SIZE - fill;
  }

  /** Highest (smallest y) point of the ramp under the x span `x0..x1`. */
  private slopeTopOverSpan(tx: number, ty: number, kind: Tile, x0: number, x1: number): number {
    return Math.min(
      this.slopeSurfaceY(tx, ty, kind, x0),
      this.slopeSurfaceY(tx, ty, kind, x1),
    );
  }

  /** Does the AABB (center cx,cy, half hw,hh) overlap any solid tile or ramp? */
  overlaps(cx: number, cy: number, hw: number, hh: number): boolean {
    const left = cx - hw;
    const right = cx + hw - SKIN;
    const bottom = cy + hh - SKIN;
    const x0 = Math.floor(left / TILE_SIZE);
    const x1 = Math.floor(right / TILE_SIZE);
    const y0 = Math.floor((cy - hh) / TILE_SIZE);
    const y1 = Math.floor(bottom / TILE_SIZE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const kind = this.tileAt(tx, ty);
        if (kind === Tile.Solid) return true;
        if (!isSlope(kind)) continue;
        const lo = Math.max(left, tx * TILE_SIZE);
        const hi = Math.min(right, (tx + 1) * TILE_SIZE);
        if (hi < lo) continue;
        if (bottom > this.slopeTopOverSpan(tx, ty, kind, lo, hi)) return true;
      }
    }
    return false;
  }

  /**
   * Surface y of the ramp supporting a body whose feet are at `cy + hh`, or null
   * when no ramp is in range.
   *
   * Candidates are limited to surfaces between one tile above the feet (the most
   * a single step can drive the body into a ramp) and `reach` pixels below them,
   * so this both lifts a body that walked into a ramp and — when `reach` is the
   * floor-snap length — keeps a grounded body glued while walking down one.
   */
  slopeFloorY(cx: number, cy: number, hw: number, hh: number, reach: number): number | null {
    const left = cx - hw;
    const right = cx + hw - SKIN;
    const feet = cy + hh;
    const tx0 = Math.floor(left / TILE_SIZE);
    const tx1 = Math.floor(right / TILE_SIZE);
    const ty0 = Math.floor((feet - TILE_SIZE) / TILE_SIZE);
    const ty1 = Math.floor((feet + reach) / TILE_SIZE);

    let best: number | null = null;
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const kind = this.tileAt(tx, ty);
        if (!isSlope(kind)) continue;
        // The surface is measured against the body's true edge, not the skinned
        // one: a sub-pixel shortfall here leaves the body resting a hair below
        // the plateau a ramp feeds into, where the next horizontal sweep catches
        // its lip and the climb stalls one pixel short of the top.
        const lo = Math.max(cx - hw, tx * TILE_SIZE);
        const hi = Math.min(cx + hw, (tx + 1) * TILE_SIZE);
        if (hi < lo) continue;
        const surface = this.slopeTopOverSpan(tx, ty, kind, lo, hi);
        if (surface < feet - TILE_SIZE || surface > feet + reach) continue;
        if (best === null || surface < best) best = surface;
      }
    }
    return best;
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
