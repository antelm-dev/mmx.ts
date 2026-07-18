/**
 * Expands a Slope entity rectangle into the tiles it covers.
 *
 * A ramp is authored in LDtk as a resizable Slope box: its width is the run,
 * its height the rise, and a Dir field says which way it climbs. That is the
 * whole of what a designer sets — angle, height and width are the box — and
 * this turns it into what the engine actually collides against: one slope tile
 * per column carrying a {@link SlopeProfile}, over solid fill down to the box's
 * base.
 *
 * Shared with tests/level.test.ts, which bakes the same rectangles onto the
 * authored ASCII grid to check the import reproduces them. Kept as plain JS
 * with no imports so `node tools/import-ldtk.mjs` needs no build step.
 */

export const TILE = 16;

/** LDtk Dir field values, and the Tile enum member each bakes down to. */
const DIRECTIONS = {
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
function validate(rect, where) {
  const { x, y, w, h, dir } = rect;
  const fail = (msg) => {
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
  ]) {
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
    // Name the two legal runs either side, since "a whole multiple" still
    // leaves the author working out which widths those are.
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
export function bakeSlope(rect, where = "slope") {
  const { run, rise } = validate(rect, where);
  const kind = DIRECTIONS[rect.dir];
  const col0 = rect.x / TILE;
  const bottomRow = rect.y / TILE + rise - 1;
  const k = run / rise; // columns spanned per tile of rise
  const out = [];

  for (let i = 0; i < run; i++) {
    // An up-left ramp is an up-right one read from the far end, with each
    // tile's two edge heights swapped.
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
    // Everything under the ramp tile, down to the box's base, is filled.
    for (let solidY = ty + 1; solidY <= bottomRow; solidY++) {
      out.push({ tx, ty: solidY, tile: "Solid", profile: null });
    }
  }
  return out;
}

/** Does this profile already say what a bare slope tile of its kind means? */
function isDefault45([l, r]) {
  return (l === 0 && r === TILE) || (l === TILE && r === 0);
}

/**
 * Read the Slope rectangles out of a level's entity list (the shape
 * tools/import-ldtk.mjs produces: id, x, y, w, h, fields).
 */
export function slopeRects(entities) {
  return entities
    .filter((e) => e.id === "Slope")
    .map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h, dir: e.fields.Dir }));
}

/**
 * Apply every Slope rectangle to a row-major grid of Tile *names*, returning
 * the sparse `{ tileIndex: [left, right] }` map of the profiles that are not
 * the plain 45-degree default.
 *
 * Mutates `tiles`. A ramp overwrites whatever the IntGrid had under it, so the
 * geometry a designer sees in LDtk is the box, not a hand-painted staircase
 * they also have to keep in sync.
 */
export function applySlopes(tiles, cols, rects, where = "slope") {
  const slopes = {};
  for (const rect of rects) {
    for (const { tx, ty, tile, profile } of bakeSlope(rect, where)) {
      // Columns are bounds-checked against `cols`, not against the flat index:
      // a box running off the right edge still lands inside the array, one row
      // down, so an index-only check would silently rewrite unrelated terrain.
      if (tx < 0 || tx >= cols || ty < 0 || ty * cols + tx >= tiles.length) {
        throw new Error(
          `${where}: Slope at ${rect.x},${rect.y} (${rect.w}x${rect.h}) reaches tile ` +
            `${tx},${ty}, which is outside the ${cols}x${tiles.length / cols} level`,
        );
      }
      const index = ty * cols + tx;
      tiles[index] = tile;
      // 45 degrees is what a bare slope tile already means; leaving those out
      // keeps the generated map to the ramps that actually need describing.
      if (profile !== null && !isDefault45(profile)) slopes[index] = profile;
    }
  }
  return slopes;
}
