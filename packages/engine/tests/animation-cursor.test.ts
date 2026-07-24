import { test } from "node:test";
import assert from "node:assert/strict";

import {
  AnimationCursor,
  assertTimedClip,
  uniformClip,
  type TimedClip,
} from "../src/core/AnimationCursor.js";
import { assertAnimData } from "../src/game/Animation.js";

test("cursor respects per-frame durations and holds a completed one-shot", () => {
  const clip: TimedClip = {
    loop: false,
    speed: 10,
    frames: [{ duration: 1 }, { duration: 2 }],
  };
  const cursor = new AnimationCursor();
  cursor.play(clip);

  assert.equal(cursor.frame, 0);
  assert.equal(cursor.advance(0.1), false);
  assert.equal(cursor.frame, 1);
  assert.equal(cursor.advance(0.2), true);
  assert.equal(cursor.frame, 1);
  assert.equal(cursor.finished, true);
  assert.equal(cursor.advance(1), false, "completion is only reported once");
});

test("cursor consumes large steps and loops without losing remainder", () => {
  const cursor = new AnimationCursor();
  cursor.play(uniformClip(4, 10, true));

  cursor.advance(0.65);
  assert.equal(cursor.frame, 2);
  cursor.advance(0.05);
  assert.equal(cursor.frame, 3);
});

test("playback mode can override the authored loop flag", () => {
  const cursor = new AnimationCursor();
  cursor.play(uniformClip(2, 10, false), 0, "loop");
  cursor.advance(0.2);
  assert.equal(cursor.frame, 0);
  assert.equal(cursor.finished, false);

  cursor.play(uniformClip(2, 10, true), 0, "once");
  assert.equal(cursor.advance(0.2), true);
  assert.equal(cursor.finished, true);
});

test("seek clamps frames and resets completion", () => {
  const cursor = new AnimationCursor();
  cursor.play(uniformClip(3, 10, false));
  cursor.advance(0.3);
  assert.equal(cursor.finished, true);

  cursor.seek(99);
  assert.equal(cursor.frame, 2);
  assert.equal(cursor.finished, false);
});

test("invalid clips fail before playback", () => {
  assert.throws(() => uniformClip(0, 10, false), /frameCount/);
  assert.throws(
    () => assertTimedClip({ loop: false, speed: 0, frames: [{ duration: 1 }] }),
    /speed/,
  );
  assert.throws(
    () => assertTimedClip({ loop: false, speed: 10, frames: [{ duration: 0 }] }),
    /duration/,
  );
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
