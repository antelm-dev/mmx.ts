import { test } from "node:test";
import assert from "node:assert/strict";

import { Input } from "../src/core/Input.js";
import {
  applyInput,
  decodeReplay,
  describeInput,
  encodeReplay,
  packInput,
  REPLAY_ACTIONS,
  REPLAY_VERSION,
} from "../src/core/Replay.js";
import { Recorder } from "../src/engine/Recorder.js";
import { Scene } from "../src/engine/Scene.js";

/**
 * The replay system's whole value is one claim: seed plus per-tick input is
 * enough to reconstruct a run exactly. These tests are that claim, checked —
 * without them the recorder is a way to produce files that confidently describe
 * a state the game never actually reaches.
 */

/** A scripted timeline, in the shape the browser records: one mask per tick. */
function script(frames: number): number[] {
  const bit = (name: (typeof REPLAY_ACTIONS)[number]): number => 1 << REPLAY_ACTIONS.indexOf(name);
  const right = bit("move_right");
  const jump = bit("jump");
  const dash = bit("dash");
  const fire = bit("fire");

  const masks: number[] = [];
  for (let f = 0; f < frames; f++) {
    let mask = 0;
    if (f >= 5) mask |= right;
    if (f >= 40 && f < 55) mask |= jump;
    if (f >= 80 && f < 130) mask |= dash;
    if (f >= 100 && f < 160) mask |= fire; // charge up, then release
    if (f >= 200 && f < 210) mask |= jump;
    masks.push(mask);
  }
  return masks;
}

test("input masks round-trip through pack/apply", () => {
  const input = new Input();
  input.setDown("move_right", true);
  input.setDown("jump", true);

  const mask = packInput(input);
  const restored = new Input();
  applyInput(restored, mask);

  for (const action of REPLAY_ACTIONS) {
    assert.equal(restored.isPressed(action), input.isPressed(action), action);
  }
  // Released actions must be applied too, not merely skipped: a replay that only
  // ever presses keys never lets go of one.
  applyInput(restored, 0);
  assert.equal(restored.isPressed("move_right"), false);
  assert.equal(describeInput(0), "-");
});

test("the same seed and inputs produce an identical run", () => {
  const masks = script(240);
  const run = (): string => {
    const scene = Scene.create({ seed: 1234 });
    for (const mask of masks) scene.step(mask);
    return scene.digest();
  };

  assert.equal(run(), run(), "two runs of the same script must agree");
});

test("a different seed produces a different run", () => {
  const masks = script(240);
  const digest = (seed: number): string => {
    const scene = Scene.create({ seed });
    for (const mask of masks) scene.step(mask);
    return scene.digest();
  };

  // The seed only drives cosmetic rolls for the player, but it also seeds the
  // enemies, whose patrol direction and hover timing steer them into different
  // places — and that is exactly what a recording has to pin down.
  assert.notEqual(digest(1234), digest(9876));
});

test("a recorded run replays to the same state", () => {
  const recorder = new Recorder({ seed: 0xc0ffee });
  for (const mask of script(300)) recorder.step(mask);

  const live = recorder.scene.digest();
  const replayed = Recorder.replay(recorder.toReplay()).digest();

  assert.equal(replayed, live, "replaying a recording must reproduce the run it captured");
});

test("a replay survives serialization", () => {
  const recorder = new Recorder({ seed: 0xc0ffee });
  for (const mask of script(300)) recorder.step(mask);

  const original = recorder.toReplay();
  const decoded = decodeReplay(encodeReplay(original));

  assert.deepEqual(decoded.frames, original.frames, "run-length encoding must be lossless");
  assert.equal(decoded.seed, original.seed);
  assert.equal(decoded.level, original.level);
  assert.equal(Recorder.replay(decoded).digest(), recorder.scene.digest());
});

test("run-length encoding actually compresses held inputs", () => {
  const recorder = new Recorder({ seed: 1 });
  for (const mask of script(600)) recorder.step(mask);

  const runs = (JSON.parse(encodeReplay(recorder.toReplay())) as { runs: unknown[] }).runs;
  // Held buttons are the common case; the script above changes input eight times,
  // so 600 frames must not cost anything like 600 entries.
  assert.ok(runs.length < 20, `expected a handful of runs, got ${runs.length}`);
});

test("rewinding reaches the state that frame originally had", () => {
  const masks = script(300);
  const recorder = new Recorder({ seed: 42 });

  const checkpoints = new Map<number, string>();
  for (const [i, mask] of masks.entries()) {
    recorder.step(mask);
    if (i === 149) checkpoints.set(recorder.frame, recorder.scene.digest());
  }

  const rewound = recorder.rewindTo(150);
  assert.equal(rewound.frame, 150);
  assert.equal(
    rewound.digest(),
    checkpoints.get(150),
    "a rewind must land on the state that frame actually had",
  );
});

test("input recorded after a rewind replaces the discarded future", () => {
  const recorder = new Recorder({ seed: 7 });
  for (const mask of script(200)) recorder.step(mask);

  recorder.rewindTo(100);
  // Take a different branch: stand still rather than continuing the script.
  for (let i = 0; i < 50; i++) recorder.step(0);

  const replay = recorder.toReplay();
  assert.equal(replay.frames.length, 150, "the abandoned tail must not be saved");
  assert.equal(
    Recorder.replay(replay).digest(),
    recorder.scene.digest(),
    "the new branch must be what replays",
  );
});

test("a replay records the level and version it was made against", () => {
  const recorder = new Recorder({ seed: 1 });
  recorder.step(0);
  const replay = recorder.toReplay();

  assert.equal(replay.version, REPLAY_VERSION);
  assert.equal(replay.level, recorder.scene.levelId);

  // Loading a recording made elsewhere must fail rather than silently run the
  // same inputs against different geometry.
  assert.throws(
    () => Recorder.replay({ ...replay, level: "some-other-level" }),
    /recorded on level/,
  );
  assert.throws(
    () => decodeReplay(JSON.stringify({ ...JSON.parse(encodeReplay(replay)), version: 99 })),
    /unsupported version/,
  );
});

test("cheats mark a recording as tainted", () => {
  const recorder = new Recorder({ seed: 1 });
  recorder.step(0);
  assert.equal(recorder.toReplay().tainted, false);

  recorder.markTainted();
  const replay = recorder.toReplay();
  assert.equal(replay.tainted, true, "a perturbed run must say so");
  assert.equal(decodeReplay(encodeReplay(replay)).tainted, true, "and must keep saying so on disk");
});
