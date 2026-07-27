import { test } from "node:test";
import assert from "node:assert/strict";
import { Recorder } from "@mmx/engine";
import {
  createRecorderDebugHost,
  DebugController,
  TIME_SCALES,
} from "../src/debug/index.js";

test("debug controller pause, step queue, and time scale", () => {
  const recorder = new Recorder({ seed: 7 });
  const debug = new DebugController({
    host: createRecorderDebugHost(recorder),
    now: () => 0,
  });

  assert.equal(debug.scaleElapsed(1), 1);
  debug.togglePause();
  assert.equal(debug.isPaused, true);
  assert.equal(debug.scaleElapsed(1), 0);

  debug.step();
  assert.equal(debug.shouldStep(), true);
  assert.equal(debug.shouldStep(), false);

  debug.setTimeScale(0.25);
  debug.resume();
  assert.equal(debug.timeScale, 0.25);
  assert.equal(debug.scaleElapsed(1), 0.25);

  debug.nudgeTimeScale(1);
  assert.equal(debug.timeScale, 0.5);
  assert.equal(TIME_SCALES.includes(debug.timeScale), true);
});

test("debug controller checkpoint, seek, and invulnerability taint", () => {
  const recorder = new Recorder({ seed: 11 });
  const debug = new DebugController({
    host: createRecorderDebugHost(recorder),
    now: () => 1000,
  });

  recorder.step(0);
  recorder.step(0);
  recorder.step(0);
  assert.equal(recorder.frame, 3);

  debug.setCheckpoint();
  assert.equal(debug.snapshot().checkpointFrame, 3);

  recorder.step(0);
  recorder.step(0);
  debug.seek(3);
  assert.equal(recorder.frame, 3);
  assert.equal(debug.isPaused, true);

  debug.setInvulnerable(true);
  assert.equal(recorder.isTainted, true);
  debug.beforeStep();
  assert.ok(recorder.scene.player.invulnerability > 0);

  const snap = debug.snapshot(1000);
  assert.equal(snap.invulnerable, true);
  assert.equal(snap.tainted, true);
  assert.equal(snap.notice, "invulnerable on (run tainted)");
});

test("debug controller diagnostics include simulation and replay sections", () => {
  const recorder = new Recorder({ seed: 3 });
  recorder.step(0);
  const debug = new DebugController({
    host: createRecorderDebugHost(recorder),
    extraDiagnostics: () => ({ sprites: 4 }),
    now: () => 0,
  });

  const text = debug.diagnostics();
  assert.match(text, /\[simulation\]/);
  assert.match(text, /\[player\]/);
  assert.match(text, /\[replay\]/);
  assert.match(text, /\[renderer\]/);
  assert.match(text, /sprites\s+4/);
});
