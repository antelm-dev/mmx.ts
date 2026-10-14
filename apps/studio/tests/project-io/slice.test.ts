import assert from "node:assert/strict";
import { test } from "node:test";

import { createProject, loadProject, saveProject } from "../../src/project-io/index.js";
import { decodePng, encodePng } from "../../src/project-io/import/png.js";
import {
  mergeRects,
  type Rect,
  sliceAuto,
  sliceGrid,
  splitRect,
  toRegions,
} from "../../src/project-io/import/slice.js";
import { createMemoryFileSystem } from "./memfs.js";

/**
 * AC-SLICE sheet: 128×64 laid out as a 4×2 grid of 32×32 cells, six spaced 20×20 frames in
 * the first six cells, and a 3×3 piece 2 px to the right of frame 2.
 */
function syntheticSheet(background: [number, number, number, number] = [0, 0, 0, 0]) {
  const width = 128;
  const height = 64;
  const px = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) px.set(background, i * 4);
  const fill = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy++)
      for (let xx = x; xx < x + w; xx++) px.set([200, 40, 40, 255], (yy * width + xx) * 4);
  };
  for (let f = 0; f < 6; f++) fill((f % 4) * 32 + 4, Math.floor(f / 4) * 32 + 4, 20, 20);
  fill(2 * 32 + 4 + 20 + 2, 10, 3, 3);
  // Round-trip through the repo's PNG writer/reader, as an imported sheet would be.
  return decodePng(encodePng({ width, height, px }));
}

test("AC-SLICE: auto finds 6 frames with a 3 px merge gap, 7 with 0; grid finds 8 cells", () => {
  const { width, height, px } = syntheticSheet();
  const merged = sliceAuto(px, width, height, { mergeGap: 3 });
  assert.equal(merged.length, 6);
  assert.deepEqual(merged[2], [68, 4, 25, 20]);
  assert.deepEqual(merged[4], [4, 36, 20, 20]);
  assert.equal(sliceAuto(px, width, height, { mergeGap: 0 }).length, 7);

  const grid = sliceGrid(width, height, { cell: [32, 32] });
  assert.equal(grid.length, 8);
  assert.deepEqual(grid[5], [32, 32, 32, 32]);
});

test("an opaque background colour is treated as empty", () => {
  const { width, height, px } = syntheticSheet([0, 128, 128, 255]);
  assert.equal(sliceAuto(px, width, height).length, 1);
  assert.equal(sliceAuto(px, width, height, { background: [0, 128, 128], mergeGap: 3 }).length, 6);
});

test("grid honours margin and spacing; merge and split are inverse on separate parts", () => {
  assert.deepEqual(sliceGrid(20, 10, { cell: [8, 8], margin: 1, spacing: 2 }), [
    [1, 1, 8, 8],
    [11, 1, 8, 8],
  ]);
  const { width, px } = syntheticSheet();
  const pair = mergeRects([
    [4, 4, 20, 20],
    [36, 4, 20, 20],
  ]);
  assert.deepEqual(pair, [4, 4, 52, 20]);
  assert.deepEqual(splitRect(px, width, pair), [
    [4, 4, 20, 20],
    [36, 4, 20, 20],
  ]);
  // One solid part is cut in half along its longer side.
  assert.deepEqual(splitRect(px, width, [4, 4, 20, 20]), [
    [4, 4, 10, 20],
    [14, 4, 10, 20],
  ]);
});

test("region ids follow reading order, optionally per row", () => {
  const rects = sliceGrid(64, 64, { cell: [32, 32] }).reverse();
  assert.deepEqual(
    toRegions(rects).map((r) => r.id),
    ["frame.0", "frame.1", "frame.2", "frame.3"],
  );
  assert.deepEqual(
    toRegions(rects, true).map((r) => [r.id, r.region[0], r.region[1]]),
    [
      ["row0.0", 0, 0],
      ["row0.1", 32, 0],
      ["row1.0", 0, 32],
      ["row1.1", 32, 32],
    ],
  );
});

test("sprite regions survive save and load; the schema refuses malformed ones on save", async () => {
  const fs = createMemoryFileSystem();
  const created = await createProject(fs, { id: "slice.project", name: "Slice" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const regions = toRegions(sliceGrid(64, 32, { cell: [32, 32] }));
  const withSheet = (value: unknown) => ({
    ...created.value,
    manifest: {
      ...created.value.manifest,
      assets: [
        {
          id: "sprite.sheet",
          kind: "sprite" as const,
          path: "assets/sprites/sheet.png",
          regions: value,
        },
      ],
    },
  });
  await fs.writeBytes("assets/sprites/sheet.png", new Uint8Array([0]));

  assert.equal((await saveProject(fs, withSheet(regions))).ok, true);
  assert.deepEqual(JSON.parse(await fs.readText("project.json")).assets[0].regions, regions);
  const loaded = await loadProject(fs);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.deepEqual((loaded.value.manifest.assets[0] as { regions?: unknown }).regions, regions);

  const badRect = await saveProject(fs, withSheet([{ id: "x", region: [0, 0, -1, 2] }]));
  assert.equal(badRect.ok, false);
  assert.ok(
    badRect.issues.some(
      (i) => i.code === "region.invalid" && i.path === "/assets/0/regions/0/region",
    ),
  );
  const dupId = await saveProject(
    fs,
    withSheet([
      { id: "x", region: [0, 0, 1, 1] },
      { id: "x", region: [1, 0, 1, 1] },
    ]),
  );
  assert.equal(dupId.ok, false);
  assert.ok(dupId.issues.some((i) => i.code === "sprite.regions"));
});

test("auto slicing a noisy 1024×1024 sheet stays fast (2000 specks, chained dots)", () => {
  const width = 1024;
  const height = 1024;
  const px = new Uint8Array(width * height * 4);
  const dot = (x: number, y: number) => px.set([255, 255, 255, 255], (y * width + x) * 4);
  // 2000 isolated 2×1 specks, 8 px apart (gap 6 > mergeGap).
  for (let i = 0; i < 2000; i++) {
    const x = (i % 50) * 8;
    const y = Math.floor(i / 50) * 8;
    dot(x, y);
    dot(x + 1, y);
  }
  // 40 rows of 300 single dots 2 px apart (gap 2 = mergeGap): each row chains into one region.
  for (let r = 0; r < 40; r++) for (let c = 0; c < 300; c++) dot(c * 3, 400 + r * 8);
  const start = performance.now();
  const rects: Rect[] = sliceAuto(px, width, height, { mergeGap: 2 });
  const elapsed = performance.now() - start;
  assert.equal(rects.length, 2040);
  assert.deepEqual(rects[2000], [0, 400, 898, 1]);
  assert.ok(elapsed < 2000, `sliceAuto took ${elapsed.toFixed(0)} ms`);
});
