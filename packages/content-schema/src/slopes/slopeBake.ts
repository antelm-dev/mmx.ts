/**
 * Expands a Slope rectangle into the tiles it covers.
 *
 * A ramp is authored as a resizable box: its width is the run, its height the
 * rise, and a Dir field says which way it climbs. That is the whole of what a
 * designer sets — angle, height and width are the box — and this turns it into
 * collision terrain: one slope tile per column carrying a slope profile, over
 * solid fill down to the box's base.
 */

export const TILE = 16;

/** A ramp rectangle in world pixels. */
export interface SlopeRect {
  x: number;
  y: number;
  w: number;
  h: number;
  dir: string;
}

/** `[left, right]` fill heights for a slope tile's surface, in pixels. */
export type SlopeProfile = [number, number];

/** Sparse map from row-major tile index to its baked slope profile. */
export type SlopeMap = Record<number, SlopeProfile>;

/** One tile a Slope rectangle claims: its grid position, kind, and profile (null for plain solid fill). */
export interface BakedTile {
  tx: number;
  ty: number;
  tile: string;
  profile: SlopeProfile | null;
}

/** Dir field values, and the tile-name string each bakes down to. */
const DIRECTIONS: Record<string, string> = {
  UpRight: "SlopeUpRight",
  UpLeft: "SlopeUpLeft",
};

/**
 * Why the run must divide evenly by the rise: a tile's surface is one straight
 * line between its two edges, so it cannot contain the point where the ramp
 * crosses from one tile row into the next. Keeping the per-column rise at
 * TILE/k for a whole k puts every one of those crossings exactly on a column
 * boundary. A 2-in-3 ramp would cross mid-tile and bake to a subtly wrong
 * surface, so it is rejected here rather than shipped as a ramp that catches.
 */
function validate(rect: SlopeRect, where: string): { run: number; rise: number } {
  const { x, y, w, h, dir } = rect;
  const fail = (msg: string): never => {
    throw new Error(`${where}: Slope at ${x},${y} (${w}x${h}) ${msg}`);
  };

  if (!(dir in DIRECTIONS)) {
    fail(`has Dir '${dir}'; expected one of ${Object.keys(DIRECTIONS).join(", ")}`);
  }
  for (const [name, v] of [
    ["x", x],
    ["y", y],
    ["width", w],
    ["height", h],
  ] as const) {
    if (v % TILE !== 0) fail(`has ${name} ${v}, which is not a multiple of ${TILE}`);
  }

  const run = w / TILE;
  const rise = h / TILE;
  if (run < 1 || rise < 1) fail("must be at least one tile in each direction");
  if (rise > run) {
    fail(
      `rises ${rise} over a run of ${run}, which is steeper than 45 degrees; ` +
        `widen it to at least ${rise} tiles`,
    );
  }
  if (run % rise !== 0) {
    const below = Math.floor(run / rise) * rise;
    const above = below + rise;
    fail(
      `rises ${rise} over a run of ${run}; the run must be a whole multiple of the ` +
        `rise, so make it ${below} or ${above} tiles wide`,
    );
  }
  return { run, rise };
}

/**
 * Bake one rectangle. Returns the tiles it claims, each as
 * `{ tx, ty, tile, profile }`, where `profile` is `[left, right]` fill heights
 * for a slope tile and null for the solid fill beneath it.
 *
 * `where` names the source in error messages.
 */
export function bakeSlope(rect: SlopeRect, where = "slope"): BakedTile[] {
  const { run, rise } = validate(rect, where);
  const kind = DIRECTIONS[rect.dir];
  const col0 = rect.x / TILE;
  const bottomRow = rect.y / TILE + rise - 1;
  const k = run / rise;
  const out: BakedTile[] = [];

  for (let i = 0; i < run; i++) {
    const j = kind === "SlopeUpRight" ? i : run - 1 - i;
    const step = j % k;
    const low = (step * TILE) / k;
    const high = ((step + 1) * TILE) / k;

    const tx = col0 + i;
    const ty = bottomRow - Math.floor(j / k);
    out.push({
      tx,
      ty,
      tile: kind,
      profile: kind === "SlopeUpRight" ? [low, high] : [high, low],
    });
    for (let solidY = ty + 1; solidY <= bottomRow; solidY++) {
      out.push({ tx, ty: solidY, tile: "Solid", profile: null });
    }
  }
  return out;
}

function isDefault45([l, r]: SlopeProfile): boolean {
  return (l === 0 && r === TILE) || (l === TILE && r === 0);
}

/**
 * Apply every Slope rectangle to a row-major grid of tile *names*, returning
 * the sparse `{ tileIndex: [left, right] }` map of the profiles that are not
 * the plain 45-degree default.
 *
 * Mutates `tiles`. A ramp overwrites whatever the grid had under it, so the
 * geometry a designer sees is the box, not a hand-painted staircase they also
 * have to keep in sync.
 */
export function applySlopes(
  tiles: string[],
  cols: number,
  rects: SlopeRect[],
  where = "slope",
): SlopeMap {
  const slopes: SlopeMap = {};
  for (const rect of rects) {
    for (const { tx, ty, tile, profile } of bakeSlope(rect, where)) {
      if (tx < 0 || tx >= cols || ty < 0 || ty * cols + tx >= tiles.length) {
        throw new Error(
          `${where}: Slope at ${rect.x},${rect.y} (${rect.w}x${rect.h}) reaches tile ` +
            `${tx},${ty}, which is outside the ${cols}x${tiles.length / cols} level`,
        );
      }
      const index = ty * cols + tx;
      tiles[index] = tile;
      if (profile !== null && !isDefault45(profile)) slopes[index] = profile;
    }
  }
  return slopes;
}
