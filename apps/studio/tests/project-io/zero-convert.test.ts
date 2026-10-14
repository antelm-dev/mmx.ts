import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cameraZones,
  cellSize,
  FEET_BELOW_CENTRE,
  introHighwayArt,
  placeInCell,
  splitScript,
  Tile,
  tileOf,
  toClip,
  type Frame,
  type Region,
  type Step,
} from "../../src/project-io/node.js";

const region = (f: number): Region => [f * 10, 0, 10, 10];

test("turns a loop-to-step-k script into one looping clip with loopStart", () => {
  const script: Step[] = [[0, 2], [1, 2], [2, 4], [3, 4], [2, 0xfe]];
  assert.deepEqual(splitScript(script), {
    steps: [{ frame: 0, duration: 2 }, { frame: 1, duration: 2 }, { frame: 2, duration: 4 }, { frame: 3, duration: 4 }],
    loop: true,
    loopStart: 2,
  });
  assert.deepEqual(toClip(script, region), {
    loop: true,
    loopStart: 2,
    speed: 60,
    frames: [
      { duration: 2, region: [0, 0, 10, 10] },
      { duration: 2, region: [10, 0, 10, 10] },
      { duration: 4, region: [20, 0, 10, 10] },
      { duration: 4, region: [30, 0, 10, 10] },
    ],
  });
  assert.equal("loopStart" in toClip([[0, 2], [1, 2], [0, 0xfe]], region), false);
  assert.deepEqual(toClip(script, region, "intro"), {
    loop: false,
    speed: 60,
    frames: [{ duration: 2, region: [0, 0, 10, 10] }, { duration: 2, region: [10, 0, 10, 10] }],
  });
  assert.deepEqual(toClip(script, region, "first").frames, [{ duration: 2, region: [0, 0, 10, 10] }]);
});

test("turns a hold script into a one-shot", () => {
  const clip = toClip([[6, 2], [7, 4], [0, 0xff]], region);
  assert.equal(clip.loop, false);
  assert.deepEqual(clip.frames.map((f) => f.duration), [2, 4]);
});

test("rejects zero-length steps and out-of-range loop targets", () => {
  assert.throws(() => splitScript([[0, 0], [0, 0xff]]), /zero-length/);
  assert.throws(() => splitScript([[0, 2], [3, 0xfe]]), /out of range/);
});

test("maps collision bytes to terrain tiles and slope profiles", () => {
  assert.deepEqual(tileOf(0), [Tile.Empty]);
  for (const b of [0x34, 0x35]) assert.deepEqual(tileOf(b), [Tile.OneWay]);
  for (const b of [0x39, 0x3a, 0x3b]) assert.deepEqual(tileOf(b), [Tile.Solid]);
  assert.deepEqual(tileOf(0x05), [Tile.SlopeUpRight, [0, 4]]);
  assert.deepEqual(tileOf(0x08), [Tile.SlopeUpRight, [12, 16]]);
  assert.deepEqual(tileOf(0x0c), [Tile.SlopeUpLeft, [16, 12]]);
  assert.deepEqual(tileOf(0x09), [Tile.SlopeUpLeft, [4, 0]]);
});

test("places the mirrored anchor at the fixed feet spot of the cell", () => {
  const frames: Frame[] = [[0, 0, 34, 39, 19, 35], [0, 0, 44, 34, 29, 30]];
  const cell = cellSize(frames);
  assert.deepEqual(cell, { w: 58, h: 46 });
  for (const f of frames) {
    const { dx, dy } = placeInCell(f, cell);
    const [, , w, h, ax, ay] = f;
    assert.deepEqual([dx + (w - ax), dy + ay], [cell.w / 2, cell.h / 2 + FEET_BELOW_CENTRE]);
    assert.ok(dx >= 0 && dy >= 0 && dx + w <= cell.w && dy + h <= cell.h);
  }
});

test("puts the stage world-locked and the background at half speed over the backdrop", () => {
  assert.deepEqual(introHighwayArt([80, 56, 8]), {
    imageLayers: [
      { id: "art-background", assetId: "image.background", x: 0, y: 0, parallax: 0.5, layer: "background" },
      { id: "art-stage", assetId: "image.stage", x: 0, y: 0, parallax: 1, layer: "world-back" },
    ],
    backdrop: "#503808",
  });
});

// The Intro Highway's four checkpoints, as stage.json has them.
const cameras = [
  { x: 128, min_x: 0, max_x: 6912, min_y: 256, max_y: 256 },
  { x: 3649, min_x: 0, max_x: 6912, min_y: 256, max_y: 256 },
  { x: 6767, min_x: 0, max_x: 6912, min_y: 256, max_y: 256 },
  { x: 8208, min_x: 0, max_x: 7936, min_y: 768, max_y: 768 },
];

test("bounds the 398x224 view by the camera limits, one zone per run of equal limits, clipped to the world", () => {
  assert.deepEqual(cameraZones(cameras, 8192, 1024), [
    { id: "camera-checkpoint-0", definitionId: "camera-zone", x: 0, y: 256, width: 6912 + 398, height: 224 },
    { id: "camera-checkpoint-3", definitionId: "camera-zone", x: 0, y: 768, width: 8192, height: 224 },
  ]);
});

test("rejects overlapping camera sections", () => {
  assert.throws(() => cameraZones([cameras[0], { ...cameras[3], min_y: 300, max_y: 300 }], 8192, 1024), /overlap/);
});
