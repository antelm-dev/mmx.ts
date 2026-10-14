// Sheet slicing for user-supplied sprite sheets (contract C-REGIONS). Pure functions over
// row-major RGBA pixels, so the renderer can run them on canvas pixels and tests on decoded PNGs.

/** `[x, y, w, h]` in sheet pixels. */
export type Rect = readonly [x: number, y: number, w: number, h: number];

/** One frame region stored on a `sprite` asset as `regions`. */
export type SpriteRegion = { id: string; region: Rect };

/** `"alpha"`: any non-transparent pixel is foreground; `[r, g, b]`: pixels of that colour are background too. */
export type SliceBackground = "alpha" | readonly [number, number, number];

type Pixels = ArrayLike<number>;

/** Transparent gaps (px) between two rects on each axis; negative when they overlap. */
function gap(a: Rect, b: Rect): number {
  const gx = Math.max(b[0] - (a[0] + a[2]), a[0] - (b[0] + b[2]));
  const gy = Math.max(b[1] - (a[1] + a[3]), a[1] - (b[1] + b[3]));
  return Math.max(gx, gy);
}

/** Bounding rect of several rects. */
export function mergeRects(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r[0]));
  const y = Math.min(...rects.map((r) => r[1]));
  const right = Math.max(...rects.map((r) => r[0] + r[2]));
  const bottom = Math.max(...rects.map((r) => r[1] + r[3]));
  return [x, y, right - x, bottom - y];
}

/** Rects grouped into rows (top to bottom), each row left to right. */
export function readingRows(rects: readonly Rect[]): Rect[][] {
  const rows: { bottom: number; rects: Rect[] }[] = [];
  for (const rect of [...rects].sort((a, b) => a[1] - b[1] || a[0] - b[0])) {
    const row = rows.at(-1);
    // A rect starting above the current row's bottom edge overlaps it vertically: same row.
    if (row && rect[1] < row.bottom) {
      row.rects.push(rect);
      row.bottom = Math.max(row.bottom, rect[1] + rect[3]);
    } else rows.push({ bottom: rect[1] + rect[3], rects: [rect] });
  }
  return rows.map((row) => row.rects.sort((a, b) => a[0] - b[0]));
}

/** 8-connected foreground components inside `area`, as bounding rects. */
function components(rgba: Pixels, w: number, area: Rect, background: SliceBackground): Rect[] {
  const [ax, ay, aw, ah] = area;
  const isForeground = (i: number): boolean => {
    if (rgba[i * 4 + 3] === 0) return false;
    if (background === "alpha") return true;
    return (
      rgba[i * 4] !== background[0] ||
      rgba[i * 4 + 1] !== background[1] ||
      rgba[i * 4 + 2] !== background[2]
    );
  };
  const seen = new Uint8Array(aw * ah);
  const out: Rect[] = [];
  const stack: number[] = [];
  for (let sy = 0; sy < ah; sy++) {
    for (let sx = 0; sx < aw; sx++) {
      if (seen[sy * aw + sx] || !isForeground((ay + sy) * w + ax + sx)) continue;
      let minX = sx,
        minY = sy,
        maxX = sx,
        maxY = sy;
      seen[sy * aw + sx] = 1;
      stack.push(sx, sy);
      while (stack.length > 0) {
        const y = stack.pop()!;
        const x = stack.pop()!;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx,
              ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= aw || ny >= ah || seen[ny * aw + nx]) continue;
            if (!isForeground((ay + ny) * w + ax + nx)) continue;
            seen[ny * aw + nx] = 1;
            stack.push(nx, ny);
          }
        }
      }
      out.push([ax + minX, ay + minY, maxX - minX + 1, maxY - minY + 1]);
    }
  }
  return out;
}

/**
 * Frame regions found as connected foreground pixels, in reading order. Rects at most
 * `mergeGap` transparent pixels apart (or overlapping) are merged, so a detached piece
 * (a muzzle flash, a hair strand) stays with its frame.
 */
export function sliceAuto(
  rgba: Pixels,
  w: number,
  h: number,
  { background = "alpha", mergeGap = 0 }: { background?: SliceBackground; mergeGap?: number } = {},
): Rect[] {
  let rects = components(rgba, w, [0, 0, w, h], background);
  // Union-find over every pair within the gap, collapse each group, and repeat: a collapsed
  // rect is larger and may now reach a neighbour.
  for (;;) {
    rects.sort((a, b) => a[0] - b[0]);
    const parent = rects.map((_, i) => i);
    const root = (i: number): number => {
      while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
      return i;
    };
    for (let i = 0; i < rects.length; i++) {
      const right = rects[i]![0] + rects[i]![2];
      // Sorted by left edge: once a rect starts beyond the gap, every later one does too.
      for (let j = i + 1; j < rects.length && rects[j]![0] - right <= mergeGap; j++) {
        if (gap(rects[i]!, rects[j]!) <= mergeGap) parent[root(j)] = root(i);
      }
    }
    const groups = new Map<number, Rect[]>();
    rects.forEach((rect, i) => {
      const group = groups.get(root(i));
      if (group) group.push(rect);
      else groups.set(root(i), [rect]);
    });
    if (groups.size === rects.length) break;
    rects = [...groups.values()].map(mergeRects);
  }
  return readingRows(rects).flat();
}

/** Grid cells of `cell` px, after an outer `margin` and with `spacing` between cells, in reading order. */
export function sliceGrid(
  w: number,
  h: number,
  {
    cell,
    margin = 0,
    spacing = 0,
  }: { cell: readonly [number, number]; margin?: number; spacing?: number },
): Rect[] {
  const [cw, ch] = cell;
  if (cw < 1 || ch < 1) return [];
  const out: Rect[] = [];
  for (let y = margin; y + ch <= h - margin; y += ch + spacing) {
    for (let x = margin; x + cw <= w - margin; x += cw + spacing) out.push([x, y, cw, ch]);
  }
  return out;
}

/** Split a region into its connected parts; a single part is cut in two along its longer side. */
export function splitRect(
  rgba: Pixels,
  w: number,
  rect: Rect,
  background: SliceBackground = "alpha",
): Rect[] {
  const parts = components(rgba, w, rect, background);
  if (parts.length > 1) return readingRows(parts).flat();
  const [x, y, rw, rh] = rect;
  if (rw >= rh) {
    if (rw < 2) return [rect];
    const half = Math.floor(rw / 2);
    return [
      [x, y, half, rh],
      [x + half, y, rw - half, rh],
    ];
  }
  const half = Math.floor(rh / 2);
  return [
    [x, y, rw, half],
    [x, y + half, rw, rh - half],
  ];
}

/** Ids for rects in reading order: `frame.N`, or `rowR.C` when grouped by row. */
export function toRegions(rects: readonly Rect[], byRow = false): SpriteRegion[] {
  const rows = readingRows(rects);
  if (byRow)
    return rows.flatMap((row, r) => row.map((region, c) => ({ id: `row${r}.${c}`, region })));
  return rows.flat().map((region, i) => ({ id: `frame.${i}`, region }));
}
