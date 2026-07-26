import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  FixedStepLoop,
  type FixedStepFrameStats,
  type FixedStepRenderFrame,
} from "../src/FixedStepLoop.js";

let now = 0;
let pending: FrameRequestCallback[] = [];
let nextRafId = 1;

const originalRaf = globalThis.requestAnimationFrame;
const originalCancel = globalThis.cancelAnimationFrame;
const originalNow = globalThis.performance?.now?.bind(globalThis.performance);

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
  nextRafId = 1;
  (globalThis as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = (
    cb,
  ) => {
    pending.push(cb);
    return nextRafId++;
  };
  (globalThis as { cancelAnimationFrame: typeof cancelAnimationFrame }).cancelAnimationFrame =
    () => {
      pending = [];
    };
  Object.defineProperty(globalThis.performance, "now", {
    configurable: true,
    value: () => now,
  });
}

afterEach(() => {
  if (originalRaf) {
    globalThis.requestAnimationFrame = originalRaf;
  } else {
    Reflect.deleteProperty(globalThis, "requestAnimationFrame");
  }
  if (originalCancel) {
    globalThis.cancelAnimationFrame = originalCancel;
  } else {
    Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
  }
  if (originalNow) {
    Object.defineProperty(globalThis.performance, "now", {
      configurable: true,
      value: originalNow,
    });
  }
});

const STEP = 1 / 60;

function createLoop(
  overrides: Partial<ConstructorParameters<typeof FixedStepLoop>[0]> = {},
): {
  loop: FixedStepLoop;
  steps: number[];
  renders: FixedStepRenderFrame[];
  stats: FixedStepFrameStats[];
  errors: unknown[];
} {
  const steps: number[] = [];
  const renders: FixedStepRenderFrame[] = [];
  const stats: FixedStepFrameStats[] = [];
  const errors: unknown[] = [];
  const loop = new FixedStepLoop({
    stepSeconds: STEP,
    maxFrameSeconds: 0.25,
    onStep: () => {
      steps.push(1);
    },
    onRender: (frame) => {
      renders.push({ ...frame });
    },
    onFrameStats: (frame) => {
      stats.push({ ...frame });
    },
    onError: (error) => {
      errors.push(error);
    },
    ...overrides,
  });
  return { loop, steps, renders, stats, errors };
}

test("start schedules a frame and is idempotent", () => {
  installRaf();
  const { loop, renders } = createLoop();
  loop.start();
  assert.equal(pending.length, 1);
  assert.equal(loop.isRunning, true);
  loop.start();
  assert.equal(pending.length, 1);
  advance(16);
  assert.equal(renders.length, 1);
  loop.stop();
});

test("elapsed smaller than stepSeconds remains in the accumulator", () => {
  installRaf();
  const { loop, steps, stats } = createLoop();
  loop.start();
  advance(8);
  assert.equal(steps.length, 0);
  assert.ok(stats[0]!.accumulatorSeconds > 0);
  assert.ok(stats[0]!.accumulatorSeconds < STEP);
  assert.equal(stats[0]!.simulationSteps, 0);
  loop.stop();
});

test("whole fixed steps execute and fractional time remains", () => {
  installRaf();
  const { loop, steps, stats } = createLoop();
  loop.start();
  advance(40);
  assert.equal(steps.length, 2);
  const expectedAcc = 0.04 - 2 * STEP;
  assert.ok(Math.abs(stats[0]!.accumulatorSeconds - expectedAcc) < 1e-12);
  assert.equal(stats[0]!.simulationSteps, 2);
  loop.stop();
});

test("large elapsed time is clamped to 250 ms", () => {
  installRaf();
  const { loop, steps, stats } = createLoop();
  loop.start();
  advance(2000);
  assert.equal(steps.length, Math.floor(0.25 / STEP));
  assert.equal(stats[0]!.elapsedSeconds, 0.25);
  assert.equal(stats[0]!.clamped, true);
  assert.equal(stats[0]!.rawElapsedSeconds, 2);
  loop.stop();
});

test("onRender runs exactly once per animation frame", () => {
  installRaf();
  const { loop, renders } = createLoop();
  loop.start();
  advance(16);
  advance(16);
  advance(16);
  assert.equal(renders.length, 3);
  loop.stop();
});

test("paused loops render but do not step", () => {
  installRaf();
  const { loop, steps, renders } = createLoop();
  loop.start();
  advance(100);
  const stepsBefore = steps.length;
  const rendersBefore = renders.length;
  loop.pause();
  advance(100);
  advance(100);
  assert.equal(steps.length, stepsBefore);
  assert.equal(renders.length, rendersBefore + 2);
  assert.equal(renders.at(-1)!.paused, true);
  assert.equal(renders.at(-1)!.simulationSteps, 0);
  loop.stop();
});

test("pausing clears accumulated partial time", () => {
  installRaf();
  const { loop, stats } = createLoop();
  loop.start();
  advance(8);
  assert.ok(stats[0]!.accumulatorSeconds > 0);
  loop.pause();
  advance(16);
  assert.equal(stats[1]!.accumulatorSeconds, 0);
  loop.stop();
});

test("resuming resets the time origin and does not catch up paused time", () => {
  installRaf();
  const { loop, steps } = createLoop();
  loop.start();
  advance(16);
  const stepsBefore = steps.length;
  loop.pause();
  now += 5000;
  loop.resume();
  advance(16);
  const gained = steps.length - stepsBefore;
  assert.ok(gained <= 1);
  assert.ok(gained < Math.floor(5 / STEP) / 2);
  loop.stop();
});

test("stop cancels the pending request and prevents rescheduling", () => {
  installRaf();
  const { loop, renders } = createLoop();
  loop.start();
  assert.equal(pending.length, 1);
  loop.stop();
  assert.equal(pending.length, 0);
  assert.equal(loop.isRunning, false);
  advance(100);
  assert.equal(renders.length, 0);
});

test("stop is idempotent", () => {
  installRaf();
  const { loop } = createLoop();
  loop.start();
  loop.stop();
  loop.stop();
  assert.equal(loop.isRunning, false);
});

test("onStep exception stops the loop and reaches onError", () => {
  installRaf();
  const boom = new Error("step boom");
  const steps: number[] = [];
  const renders: FixedStepRenderFrame[] = [];
  const errors: unknown[] = [];
  const loop = new FixedStepLoop({
    stepSeconds: STEP,
    onStep: () => {
      steps.push(1);
      throw boom;
    },
    onRender: (frame) => {
      renders.push({ ...frame });
    },
    onError: (error) => {
      errors.push(error);
    },
  });
  loop.start();
  advance(100);
  assert.equal(errors.length, 1);
  assert.equal(errors[0], boom);
  assert.equal(loop.isRunning, false);
  const stepsBefore = steps.length;
  const rendersBefore = renders.length;
  advance(100);
  assert.equal(steps.length, stepsBefore);
  assert.equal(renders.length, rendersBefore);
});

test("onRender exception stops the loop and reaches onError", () => {
  installRaf();
  const boom = new Error("render boom");
  const { loop, errors } = createLoop({
    onRender: () => {
      throw boom;
    },
  });
  loop.start();
  advance(16);
  assert.equal(errors[0], boom);
  assert.equal(loop.isRunning, false);
});

test("onFrameStats exception stops the loop and reaches onError", () => {
  installRaf();
  const boom = new Error("stats boom");
  const { loop, errors } = createLoop({
    onFrameStats: () => {
      throw boom;
    },
  });
  loop.start();
  advance(16);
  assert.equal(errors[0], boom);
  assert.equal(loop.isRunning, false);
});

test("invalid stepSeconds and maxFrameSeconds are rejected", () => {
  const base = {
    onStep: () => {},
    onRender: () => {},
  };
  assert.throws(() => new FixedStepLoop({ ...base, stepSeconds: 0 }), RangeError);
  assert.throws(() => new FixedStepLoop({ ...base, stepSeconds: -1 }), RangeError);
  assert.throws(() => new FixedStepLoop({ ...base, stepSeconds: Number.NaN }), RangeError);
  assert.throws(
    () => new FixedStepLoop({ ...base, stepSeconds: STEP, maxFrameSeconds: 0 }),
    RangeError,
  );
  assert.throws(
    () => new FixedStepLoop({ ...base, stepSeconds: STEP, maxFrameSeconds: -0.1 }),
    RangeError,
  );
  assert.throws(
    () =>
      new FixedStepLoop({
        ...base,
        stepSeconds: STEP,
        maxFrameSeconds: Number.POSITIVE_INFINITY,
      }),
    RangeError,
  );
});

test("frame stats report raw, effective, clamp, steps, accumulator, alpha, paused", () => {
  installRaf();
  const { loop, stats } = createLoop();
  loop.start();
  advance(40);
  const s = stats[0]!;
  assert.equal(s.rawElapsedSeconds, 0.04);
  assert.equal(s.elapsedSeconds, 0.04);
  assert.equal(s.clamped, false);
  assert.equal(s.simulationSteps, 2);
  assert.ok(s.accumulatorSeconds >= 0 && s.accumulatorSeconds < STEP);
  assert.ok(Math.abs(s.interpolationAlpha - s.accumulatorSeconds / STEP) < 1e-12);
  assert.equal(s.paused, false);

  loop.pause();
  advance(1000);
  const paused = stats[1]!;
  assert.equal(paused.paused, true);
  assert.equal(paused.elapsedSeconds, 0);
  assert.equal(paused.simulationSteps, 0);
  assert.equal(paused.clamped, false);
  assert.equal(paused.rawElapsedSeconds, 1);
  loop.stop();
});

test("onFrameStart can return zero and scaled elapsed before clamp", () => {
  installRaf();
  const starts: number[] = [];
  const { loop, steps, stats } = createLoop({
    onFrameStart: (frame) => {
      starts.push(frame.rawElapsedSeconds);
      if (starts.length === 1) return { elapsedSeconds: 0 };
      return { elapsedSeconds: frame.rawElapsedSeconds * 2 };
    },
  });
  loop.start();
  advance(100);
  assert.equal(starts[0], 0.1);
  assert.equal(steps.length, 0);
  assert.equal(stats[0]!.elapsedSeconds, 0);

  advance(100);
  assert.equal(starts[1], 0.1);
  assert.equal(stats[1]!.rawElapsedSeconds, 0.1);
  assert.equal(stats[1]!.elapsedSeconds, 0.2);
  assert.equal(stats[1]!.clamped, false);
  assert.equal(steps.length, Math.floor(0.2 / STEP));

  advance(200);
  assert.equal(stats[2]!.rawElapsedSeconds, 0.2);
  assert.equal(stats[2]!.elapsedSeconds, 0.25);
  assert.equal(stats[2]!.clamped, true);
  loop.stop();
});

test("without onError, step errors propagate from the frame callback", () => {
  installRaf();
  const boom = new Error("unhandled");
  const loop = new FixedStepLoop({
    stepSeconds: STEP,
    onStep: () => {
      throw boom;
    },
    onRender: () => {},
  });
  loop.start();
  assert.throws(() => advance(100), (error: unknown) => error === boom);
  assert.equal(loop.isRunning, false);
});

test("onError throwing does not reschedule the loop", () => {
  installRaf();
  const loop = new FixedStepLoop({
    stepSeconds: STEP,
    onStep: () => {
      throw new Error("step");
    },
    onRender: () => {},
    onError: () => {
      throw new Error("handler");
    },
  });
  loop.start();
  assert.throws(() => advance(100), /handler/);
  assert.equal(loop.isRunning, false);
  assert.equal(pending.length, 0);
});
