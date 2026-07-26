import { test } from "node:test";
import assert from "node:assert/strict";
import { PlaytestClock } from "../src/PlaytestClock.js";

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
  clock.pause();
  advance(100);
  advance(100);
  assert.equal(steps, stepsBeforePause);
  assert.ok(renders > 1);

  clock.resume();
  advance(100);
  assert.ok(steps > stepsBeforePause);
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
