import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assertAnimData,
  assertRegion,
  type AnimData,
  type Region,
} from "../src/animation/index.js";

test("assertRegion accepts a valid atlas rectangle", () => {
  const region: Region = [8, 16, 24, 32];
  assert.doesNotThrow(() => assertRegion(region));
});

test("assertRegion rejects negative coordinates and non-positive sizes", () => {
  assert.throws(() => assertRegion([-1, 0, 8, 8]), /region/);
  assert.throws(() => assertRegion([0, 0, 0, 8]), /region/);
  assert.throws(() => assertRegion([0, 0, 8, -1]), /region/);
});

test("assertAnimData accepts a minimal clip table", () => {
  const data: AnimData = {
    animations: {
      idle: {
        loop: true,
        speed: 10,
        frames: [{ region: [0, 0, 16, 16], duration: 1 }],
      },
    },
  };
  assert.doesNotThrow(() => assertAnimData(data));
});

test("assertAnimData rejects malformed frames and empty tables", () => {
  assert.throws(() => assertAnimData({ animations: {} }), /at least one/);
  assert.throws(
    () =>
      assertAnimData({
        animations: {
          broken: { loop: false, speed: 10, frames: [{ duration: 1, region: [-1, 0, 8, 8] }] },
        },
      }),
    /region/,
  );
});

test("assertAnimData bounds loopStart to the clip's frames", () => {
  const data = (loopStart: number): unknown => ({
    animations: {
      run: {
        loop: true,
        loopStart,
        speed: 10,
        frames: [
          { region: [0, 0, 16, 16], duration: 1 },
          { region: [16, 0, 16, 16], duration: 1 },
        ],
      },
    },
  });
  assert.doesNotThrow(() => assertAnimData(data(1)));
  for (const bad of [-1, 2, 0.5]) assert.throws(() => assertAnimData(data(bad)), /loopStart/);
});

test("assertAnimData keeps a frame anchor inside its region", () => {
  const data = (anchor: unknown): unknown => ({
    animations: {
      idle: { loop: true, speed: 60, frames: [{ region: [0, 0, 34, 39], duration: 6, anchor }] },
    },
  });
  for (const ok of [
    [19, 35],
    [0, 0],
    [34, 39],
  ])
    assert.doesNotThrow(() => assertAnimData(data(ok)));
  for (const bad of [[-1, 0], [35, 0], [0, 40], [1.5, 2], [1], "19,35"]) {
    assert.throws(() => assertAnimData(data(bad)), /anchor/);
  }
});

test("assertAnimData validates per-frame hurtbox and hitboxes", () => {
  const data = (extra: Record<string, unknown>): unknown => ({
    animations: {
      idle: { loop: true, speed: 60, frames: [{ region: [0, 0, 34, 39], duration: 6, ...extra }] },
    },
  });
  assert.doesNotThrow(() =>
    assertAnimData(
      data({
        hurtbox: { x: -8, y: -20, w: 16, h: 20 },
        hitboxes: [{ x: 4, y: -10, w: 12, h: 6 }],
      }),
    ),
  );
  assert.doesNotThrow(() => assertAnimData(data({ hitboxes: [] })));
  for (const bad of [
    { x: 0, y: 0, w: 0, h: 4 },
    { x: 0.5, y: 0, w: 4, h: 4 },
    { x: 0, y: 0, w: 4 },
    [0, 0, 4, 4],
  ]) {
    assert.throws(() => assertAnimData(data({ hurtbox: bad })), /hurtbox/);
    assert.throws(() => assertAnimData(data({ hitboxes: [bad] })), /hitboxes/);
  }
  assert.throws(() => assertAnimData(data({ hitboxes: { x: 0, y: 0, w: 4, h: 4 } })), /hitboxes/);
});
