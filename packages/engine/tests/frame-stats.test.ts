import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FrameStats,
  SAMPLE_COUNT,
  ZERO_FRAME_STATS,
  type FrameSample,
} from "../src/core/FrameStats.js";

function sample(partial: Partial<FrameSample> = {}): FrameSample {
  return {
    frameTime: 16.67,
    simulation: 1,
    rendering: 2,
    frameWork: 3,
    simulationSteps: 1,
    accumulator: 0,
    ...partial,
  };
}

test("empty statistics return zeros", () => {
  const stats = new FrameStats();
  assert.equal(stats.fps, 0);
  assert.deepEqual(
    stats.summarize((s) => s.simulation),
    { median: 0, p95: 0, worst: 0 },
  );
  assert.deepEqual(stats.toSnapshot(), ZERO_FRAME_STATS);
});

test("rolling sample capacity drops the oldest entries", () => {
  const stats = new FrameStats();
  for (let i = 0; i < SAMPLE_COUNT + 10; i++) {
    stats.record(sample({ frameTime: i, simulation: i }));
  }
  assert.equal(stats.sampleCount, SAMPLE_COUNT);
  assert.equal(stats.history[0]?.frameTime, 10);
  assert.equal(stats.latest?.frameTime, SAMPLE_COUNT + 9);
});

test("fps averages over the rolling window", () => {
  const stats = new FrameStats();
  stats.record(sample({ frameTime: 10 }));
  stats.record(sample({ frameTime: 20 }));
  stats.record(sample({ frameTime: 30 }));
  assert.equal(stats.fps, (3 * 1000) / 60);
});

test("median, p95, and worst match percentile semantics", () => {
  const stats = new FrameStats();
  for (const simulation of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    stats.record(sample({ simulation }));
  }
  const summary = stats.summarize((s) => s.simulation);
  assert.equal(summary.median, 6);
  assert.equal(summary.p95, 10);
  assert.equal(summary.worst, 10);
});

test("catch-up frames increment only when more than one fixed step runs", () => {
  const stats = new FrameStats();
  stats.record(sample({ simulationSteps: 0 }));
  stats.record(sample({ simulationSteps: 1 }));
  stats.record(sample({ simulationSteps: 2 }));
  stats.record(sample({ simulationSteps: 3 }));
  assert.equal(stats.catchUpFrames, 2);
});

test("discarded duration equals elapsed time beyond the clamp", () => {
  const stats = new FrameStats();
  stats.addDiscardedSeconds(0);
  stats.addDiscardedSeconds(-1);
  assert.equal(stats.discardedSimulationTime, 0);
  assert.equal(stats.droppedFrames, 0);

  stats.addDiscardedSeconds(0.1);
  stats.addDiscardedSeconds(0.05);
  assert.equal(stats.discardedSimulationTime, 150);
  assert.equal(stats.droppedFrames, 2);
});

test("toSnapshot does not alias mutable sample storage", () => {
  const stats = new FrameStats();
  stats.record(sample({ simulation: 4, rendering: 5 }));
  stats.addDiscardedSeconds(0.02);
  const snap = stats.toSnapshot();
  assert.equal(snap.fps > 0, true);
  assert.equal(snap.simulation.median, 4);
  assert.equal(snap.rendering.median, 5);
  assert.equal(snap.discardedSimulationTime, 20);
  assert.throws(() => {
    (snap as { fps: number }).fps = 0;
  });
});
