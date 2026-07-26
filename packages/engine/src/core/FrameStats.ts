/**
 * Rolling frame timings.
 *
 * Pure data — it owns no DOM, so a panel can draw it however it likes and the
 * numbers can also be dumped to the clipboard or read from the console without a
 * visible HUD. Allocation-bounded: a fixed ring of samples, so leaving the
 * profiler running for an hour costs the same as leaving it running for a second.
 */

export const SAMPLE_COUNT = 240;

export interface FrameSample {
  /** Wall-clock milliseconds since the previous rAF callback. */
  frameTime: number;
  /** Time inside the fixed-step loop, in milliseconds. */
  simulation: number;
  /** Time inside the renderer, in milliseconds. */
  rendering: number;
  /** Everything this frame did, sim and render together, in milliseconds. */
  frameWork: number;
  /** Fixed steps taken this frame — 0 when the accumulator had not filled. */
  simulationSteps: number;
  /** Accumulator left over after stepping, in seconds. */
  accumulator: number;
}

export interface Summary {
  median: number;
  p95: number;
  worst: number;
}

/** Summarized display metrics; safe to hand to UI without exposing the collector. */
export type FrameStatsSnapshot = Readonly<{
  fps: number;
  simulation: Readonly<Summary>;
  rendering: Readonly<Summary>;
  catchUpFrames: number;
  /**
   * Cumulative wall-clock simulation time discarded by the frame-time clamp,
   * in milliseconds.
   */
  discardedSimulationTime: number;
}>;

export const ZERO_FRAME_STATS: FrameStatsSnapshot = Object.freeze({
  fps: 0,
  simulation: Object.freeze({ median: 0, p95: 0, worst: 0 }),
  rendering: Object.freeze({ median: 0, p95: 0, worst: 0 }),
  catchUpFrames: 0,
  discardedSimulationTime: 0,
});

function summarize(values: readonly number[]): Summary {
  if (values.length === 0) return { median: 0, p95: 0, worst: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number): number => sorted[Math.ceil((sorted.length - 1) * p)]!;
  return { median: percentile(0.5), p95: percentile(0.95), worst: sorted[sorted.length - 1]! };
}

export function formatSummary(summary: Summary): string {
  return `${summary.median.toFixed(1)} / ${summary.p95.toFixed(1)} / ${summary.worst.toFixed(1)}`;
}

export class FrameStats {
  private readonly samples: FrameSample[] = [];

  /**
   * Frames whose elapsed time was clamped before reaching the accumulator.
   *
   * This is the honest definition of a dropped frame for a fixed-step loop. The
   * loop caps accumulated time (otherwise a long stall queues hundreds of steps
   * and the game fast-forwards, or never catches up at all), and that cap
   * *discards simulation time* — the world skips. Counting rAF callbacks that ran
   * long would flag ordinary jitter; counting the clamp flags the frames where
   * the simulation actually lost time.
   */
  droppedFrames = 0;

  /**
   * Cumulative wall-clock time removed by the frame-time clamp, in milliseconds.
   * Distinct from {@link droppedFrames}: that counts clamp events, this sums the
   * discarded duration.
   */
  discardedSimulationTime = 0;

  /** Frames where more than one fixed step ran, i.e. the loop was catching up. */
  catchUpFrames = 0;

  record(sample: FrameSample): void {
    this.samples.push(sample);
    if (this.samples.length > SAMPLE_COUNT) this.samples.shift();
    if (sample.simulationSteps > 1) this.catchUpFrames++;
  }

  /**
   * Record time discarded by clamping elapsed seconds before they enter the
   * accumulator. Increments {@link droppedFrames} once per positive discard.
   */
  addDiscardedSeconds(seconds: number): void {
    if (seconds <= 0) return;
    this.discardedSimulationTime += seconds * 1000;
    this.droppedFrames++;
  }

  get latest(): FrameSample | undefined {
    return this.samples[this.samples.length - 1];
  }

  get history(): readonly FrameSample[] {
    return this.samples.slice();
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  /**
   * Frames per second over the sample window.
   *
   * Averaged across the window rather than inverted from the last frame: a
   * per-frame reciprocal swings between 55 and 65 on a perfectly healthy vsync
   * and reads as a problem that is not there.
   */
  get fps(): number {
    if (this.samples.length === 0) return 0;
    const total = this.samples.reduce((sum, s) => sum + s.frameTime, 0);
    return total > 0 ? (this.samples.length * 1000) / total : 0;
  }

  summarize(pick: (sample: FrameSample) => number): Summary {
    return summarize(this.samples.map(pick));
  }

  /** Immutable summary for UI / snapshots — never aliases internal sample storage. */
  toSnapshot(): FrameStatsSnapshot {
    return Object.freeze({
      fps: this.fps,
      simulation: Object.freeze(this.summarize((s) => s.simulation)),
      rendering: Object.freeze(this.summarize((s) => s.rendering)),
      catchUpFrames: this.catchUpFrames,
      discardedSimulationTime: this.discardedSimulationTime,
    });
  }
}
