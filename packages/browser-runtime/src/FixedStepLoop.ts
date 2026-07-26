export interface FixedStepFrameStart {
  /** Wall-clock seconds since the previous animation frame (unclamped). */
  rawElapsedSeconds: number;
  paused: boolean;
  stepSeconds: number;
  maxFrameSeconds: number;
}

export interface FixedStepRenderFrame {
  /** Wall-clock seconds since the previous animation frame (unclamped). */
  rawElapsedSeconds: number;
  /**
   * Seconds added to the accumulator this frame after clamping.
   * Zero while paused.
   */
  elapsedSeconds: number;
  /** Whole fixed steps executed from the accumulator this frame. */
  simulationSteps: number;
  /** Residual accumulator after stepping, in seconds. */
  accumulatorSeconds: number;
  /**
   * `accumulatorSeconds / stepSeconds`, suitable for interpolating between the
   * last completed step and the next one.
   */
  interpolationAlpha: number;
  paused: boolean;
}

export interface FixedStepFrameStats extends FixedStepRenderFrame {
  /** True when the pre-clamp contribution exceeded `maxFrameSeconds`. */
  clamped: boolean;
}

export interface FixedStepLoopOptions {
  /**
   * Fixed simulation interval in seconds. Callers supply their own constant
   * (for example engine `DT`); this package never imports one.
   */
  stepSeconds: number;
  /**
   * Upper bound on seconds contributed to the accumulator from a single frame.
   * Defaults to `0.25`. Time above the cap is discarded so a backgrounded tab
   * cannot queue hundreds of catch-up steps (or fail to converge if catch-up
   * itself takes longer than the stall).
   */
  maxFrameSeconds?: number;
  onStep: () => void;
  /** Invoked once per animation frame, including paused and zero-step frames. */
  onRender: (frame: FixedStepRenderFrame) => void;
  /**
   * Optional hook before accumulator updates. Use it to poll input or to
   * replace the elapsed contribution (for example scale time or suppress it
   * while a modal is open). The returned value is still clamped to
   * `maxFrameSeconds` afterwards.
   */
  onFrameStart?: (
    frame: FixedStepFrameStart,
  ) => void | { elapsedSeconds?: number };
  onFrameStats?: (stats: FixedStepFrameStats) => void;
  /**
   * Called when `onFrameStart`, `onStep`, `onRender`, or `onFrameStats` throws.
   * The loop is stopped first and no further frames are scheduled. When omitted,
   * the original error is rethrown from the animation-frame callback after the
   * loop has been stopped.
   */
  onError?: (error: unknown) => void;
}

const DEFAULT_MAX_FRAME_SECONDS = 0.25;

/**
 * Browser fixed-timestep scheduler driven by `requestAnimationFrame`.
 *
 * Each frame measures wall-clock elapsed time, optionally transforms it via
 * `onFrameStart`, clamps it to `maxFrameSeconds`, and — when not paused — adds
 * it to an accumulator. `onStep` runs once per whole `stepSeconds` interval
 * drained from that accumulator. `onRender` runs exactly once per animation
 * frame so presentation can continue while simulation is paused.
 *
 * Pause clears the accumulator and skips stepping without cancelling the rAF
 * loop. Resume resets the time origin so wall time spent paused never becomes
 * catch-up work. Stop cancels the pending frame and ignores in-flight callbacks.
 */
export class FixedStepLoop {
  private readonly stepSeconds: number;
  private readonly maxFrameSeconds: number;
  private readonly onStep: () => void;
  private readonly onRender: (frame: FixedStepRenderFrame) => void;
  private readonly onFrameStart?: FixedStepLoopOptions["onFrameStart"];
  private readonly onFrameStats?: (stats: FixedStepFrameStats) => void;
  private readonly onError?: (error: unknown) => void;

  private raf = 0;
  private acc = 0;
  private last = 0;
  private running = false;
  private paused = false;

  private readonly frameStart: FixedStepFrameStart = {
    rawElapsedSeconds: 0,
    paused: false,
    stepSeconds: 0,
    maxFrameSeconds: 0,
  };

  private readonly renderFrame: FixedStepFrameStats = {
    rawElapsedSeconds: 0,
    elapsedSeconds: 0,
    simulationSteps: 0,
    accumulatorSeconds: 0,
    interpolationAlpha: 0,
    paused: false,
    clamped: false,
  };

  constructor(options: FixedStepLoopOptions) {
    const { stepSeconds, maxFrameSeconds = DEFAULT_MAX_FRAME_SECONDS } = options;
    if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
      throw new RangeError(`stepSeconds must be a finite number > 0 (got ${stepSeconds})`);
    }
    if (!Number.isFinite(maxFrameSeconds) || maxFrameSeconds <= 0) {
      throw new RangeError(
        `maxFrameSeconds must be a finite number > 0 (got ${maxFrameSeconds})`,
      );
    }
    this.stepSeconds = stepSeconds;
    this.maxFrameSeconds = maxFrameSeconds;
    this.onStep = options.onStep;
    this.onRender = options.onRender;
    this.onFrameStart = options.onFrameStart;
    this.onFrameStats = options.onFrameStats;
    this.onError = options.onError;
    this.frameStart.stepSeconds = stepSeconds;
    this.frameStart.maxFrameSeconds = maxFrameSeconds;
  }

  get isRunning(): boolean {
    return this.running;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.acc = 0;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  pause(): void {
    this.paused = true;
    this.acc = 0;
  }

  resume(): void {
    this.paused = false;
    this.last = performance.now();
    this.acc = 0;
  }

  stop(): void {
    if (!this.running && this.raf === 0) return;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;

    const rawElapsedSeconds = (now - this.last) / 1000;
    this.last = now;

    try {
      this.frameStart.rawElapsedSeconds = rawElapsedSeconds;
      this.frameStart.paused = this.paused;

      let proposed = rawElapsedSeconds;
      if (this.onFrameStart) {
        const result = this.onFrameStart(this.frameStart);
        if (result?.elapsedSeconds !== undefined) {
          proposed = result.elapsedSeconds;
        }
      }

      let elapsedSeconds = 0;
      let clamped = false;
      let simulationSteps = 0;

      if (!this.paused) {
        clamped = proposed > this.maxFrameSeconds;
        elapsedSeconds = Math.min(this.maxFrameSeconds, proposed);
        this.acc += elapsedSeconds;
        while (this.acc >= this.stepSeconds) {
          this.onStep();
          this.acc -= this.stepSeconds;
          simulationSteps++;
        }
      }

      const frame = this.renderFrame;
      frame.rawElapsedSeconds = rawElapsedSeconds;
      frame.elapsedSeconds = elapsedSeconds;
      frame.simulationSteps = simulationSteps;
      frame.accumulatorSeconds = this.acc;
      frame.interpolationAlpha = this.acc / this.stepSeconds;
      frame.paused = this.paused;
      frame.clamped = clamped;

      this.onRender(frame);
      this.onFrameStats?.(frame);
    } catch (error) {
      this.running = false;
      this.raf = 0;
      if (this.onError) {
        this.onError(error);
        return;
      }
      throw error;
    }

    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
  };
}
