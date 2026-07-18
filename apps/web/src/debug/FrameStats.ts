/**
 * Rolling frame timings.
 *
 * Pure data — it owns no DOM, so the panel can draw it however it likes and the
 * numbers can also be dumped to the clipboard or read from the console without a
 * visible HUD. Allocation-bounded: a fixed ring of samples, so leaving the
 * profiler running for an hour costs the same as leaving it running for a second.
 */

export const SAMPLE_COUNT = 240;

export interface FrameSample {
  /** Wall-clock milliseconds since the previous rAF callback. */
  frameTime: number;
  /** Time inside the fixed-step loop. */
  simulation: number;
  /** Time inside the renderer. */
  rendering: number;
  /** Everything this frame did, sim and render together. */
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

function summarize(values: readonly number[]): Summary {
  if (values.length === 0) return { median: 0, p95: 0, worst: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number): number => sorted[Math.ceil((sorted.length - 1) * p)]!;
  return { median: percentile(0.5), p95: percentile(0.95), worst: sorted.at(-1)! };
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

  /** Frames where more than one fixed step ran, i.e. the loop was catching up. */
  catchUpFrames = 0;

  record(sample: FrameSample): void {
    this.samples.push(sample);
    if (this.samples.length > SAMPLE_COUNT) this.samples.shift();
    if (sample.simulationSteps > 1) this.catchUpFrames++;
  }

  get latest(): FrameSample | undefined {
    return this.samples.at(-1);
  }

  get history(): readonly FrameSample[] {
    return this.samples;
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
}
