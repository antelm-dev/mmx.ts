import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaytestClock } from "./PlaytestClock.js";

/**
 * Drive the clock with a fake `requestAnimationFrame` and clock so the
 * fixed-step accumulator can be exercised deterministically, with no real timers.
 */
let now = 0;
let pending: FrameRequestCallback[] = [];

function flushFrame(): void {
  const batch = pending;
  pending = [];
  for (const cb of batch) cb(now);
}

/** Advance wall time by `ms` and run one animation frame at the new time. */
function advance(ms: number): void {
  now += ms;
  flushFrame();
}

beforeEach(() => {
  now = 0;
  pending = [];
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    pending.push(cb);
    return pending.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PlaytestClock", () => {
  it("runs a whole number of fixed steps per displayed frame", () => {
    let steps = 0;
    let renders = 0;
    const clock = new PlaytestClock({
      onStep: () => steps++,
      onRender: () => renders++,
      onError: () => {},
    });
    clock.start();
    advance(200);
    expect(steps).toBeGreaterThan(0);
    expect(renders).toBe(1);
  });

  it("freezes the simulation while paused but keeps rendering", () => {
    let steps = 0;
    let renders = 0;
    const clock = new PlaytestClock({
      onStep: () => steps++,
      onRender: () => renders++,
      onError: () => {},
    });
    clock.start();
    advance(100);
    const stepsBeforePause = steps;
    const rendersBeforePause = renders;
    expect(stepsBeforePause).toBeGreaterThan(0);

    clock.pause();
    advance(100);
    advance(100);
    expect(steps).toBe(stepsBeforePause); // no simulation while paused
    expect(renders).toBeGreaterThan(rendersBeforePause); // but the picture stays live

    clock.resume();
    advance(100);
    expect(steps).toBeGreaterThan(stepsBeforePause); // stepping resumes
  });

  it("stops and reports when a step throws", () => {
    const onError = vi.fn();
    let steps = 0;
    const clock = new PlaytestClock({
      onStep: () => {
        steps++;
        throw new Error("boom");
      },
      onRender: () => {},
      onError,
    });
    clock.start();
    advance(100);
    expect(onError).toHaveBeenCalledOnce();
    // The loop is dead: further frames do nothing (and none were re-queued).
    const before = steps;
    advance(100);
    expect(steps).toBe(before);
  });
});
