import { test } from "node:test";
import assert from "node:assert/strict";
import { DT } from "@mmx/engine";
import { PlaytestClock } from "../src/PlaytestClock.js";
import { STOPPED_PLAYTEST } from "../src/snapshots.js";

let now = 0;
let pending: FrameRequestCallback[] = [];

function flushFrame(): void {
  const batch = pending;
  pending = [];
  for (const cb of batch) cb(now);
}

function advance(ms: number): void {
  now += ms;
  flushFrame();
}

function installRaf(): void {
  now = 0;
  pending = [];
  (globalThis as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = (
    cb,
  ) => {
    pending.push(cb);
    return pending.length;
  };
  (globalThis as { cancelAnimationFrame: typeof cancelAnimationFrame }).cancelAnimationFrame =
    () => {};
  const perf = globalThis.performance;
  Object.defineProperty(perf, "now", { configurable: true, value: () => now });
}

test("PlaytestClock runs whole fixed steps and freezes them while paused", () => {
  installRaf();
  let steps = 0;
  let renders = 0;
  const clock = new PlaytestClock({
    onStep: () => steps++,
    onRender: () => renders++,
    onError: () => {},
  });
  clock.start();
  advance(100);
  assert.ok(steps > 0);
  assert.equal(renders, 1);

  const stepsBeforePause = steps;
  const discardedBeforePause = clock.frameStatsSnapshot().discardedSimulationTime;
  clock.pause();
  advance(100);
  advance(100);
  assert.equal(steps, stepsBeforePause);
  assert.ok(renders > 1);
  assert.equal(clock.frameStatsSnapshot().discardedSimulationTime, discardedBeforePause);

  clock.resume();
  advance(100);
  assert.ok(steps > stepsBeforePause);
  assert.equal(clock.frameStatsSnapshot().discardedSimulationTime, discardedBeforePause);
  clock.stop();
});

test("PlaytestClock stops and reports when a step throws", () => {
  installRaf();
  const errors: unknown[] = [];
  let steps = 0;
  const clock = new PlaytestClock({
    onStep: () => {
      steps++;
      throw new Error("boom");
    },
    onRender: () => {},
    onError: (error) => errors.push(error),
  });
  clock.start();
  advance(100);
  assert.equal(errors.length, 1);
  const before = steps;
  advance(100);
  assert.equal(steps, before);
});

test("PlaytestClock records catch-up only when more than one fixed step runs", () => {
  installRaf();
  let steps = 0;
  const clock = new PlaytestClock({
    onStep: () => steps++,
    onRender: () => {},
    onError: () => {},
  });
  clock.start();

  advance(DT * 1000 * 0.5);
  assert.equal(steps, 0);
  assert.equal(clock.frameStatsSnapshot().catchUpFrames, 0);

  advance(DT * 1000);
  assert.equal(steps, 1);
  assert.equal(clock.frameStatsSnapshot().catchUpFrames, 0);

  advance(DT * 1000 * 3);
  assert.equal(steps, 4);
  assert.equal(clock.frameStatsSnapshot().catchUpFrames, 1);
  clock.stop();
});

test("PlaytestClock accumulates discarded duration beyond the frame clamp", () => {
  installRaf();
  const clock = new PlaytestClock({
    onStep: () => {},
    onRender: () => {},
    onError: () => {},
  });
  clock.start();

  advance(1000);
  const snap = clock.frameStatsSnapshot();
  assert.equal(snap.discardedSimulationTime, (1 - 0.25) * 1000);
  clock.stop();
});

test("PlaytestClock paused time is not reported as discarded", () => {
  installRaf();
  const clock = new PlaytestClock({
    onStep: () => {},
    onRender: () => {},
    onError: () => {},
  });
  clock.start();
  advance(16);
  clock.pause();
  advance(2000);
  clock.resume();
  advance(16);
  assert.equal(clock.frameStatsSnapshot().discardedSimulationTime, 0);
  clock.stop();
});

test("PlaytestClock instrumentation records simulation and rendering durations", () => {
  installRaf();
  const clock = new PlaytestClock({
    onStep: () => {
      now += 2;
    },
    onRender: () => {
      now += 3;
    },
    onError: () => {},
  });
  clock.start();
  advance(20);
  const snap = clock.frameStatsSnapshot();
  assert.ok(snap.simulation.median >= 2);
  assert.ok(snap.rendering.median >= 3);
  assert.ok(snap.fps > 0);
  clock.stop();
});

test("STOPPED_PLAYTEST exposes zero-valued frame statistics", () => {
  assert.deepEqual(STOPPED_PLAYTEST.frameStats, {
    fps: 0,
    simulation: { median: 0, p95: 0, worst: 0 },
    rendering: { median: 0, p95: 0, worst: 0 },
    catchUpFrames: 0,
    discardedSimulationTime: 0,
  });
});
