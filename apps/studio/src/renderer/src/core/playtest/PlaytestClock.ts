import { DT } from "@mmx/engine/core/constants.js";

/** Clamp a display frame's elapsed time so a stalled tab does not spiral-of-death catch-up. */
const MAX_FRAME_SECONDS = 0.25;

export interface PlaytestClockCallbacks {
  /** Advance the simulation exactly one deterministic fixed step. */
  onStep: () => void;
  /** Draw the current state. Runs every animation frame, including while paused. */
  onRender: () => void;
  /** Report a thrown error from a step or render so the host can tear the run down. */
  onError: (error: unknown) => void;
}

/**
 * The browser side of the fixed-step loop: a `requestAnimationFrame` driver with
 * an accumulator that calls `onStep` a whole number of times per displayed frame
 * so the simulation stays deterministic regardless of refresh rate.
 *
 * Pause freezes the accumulator — no `onStep` fires — while `onRender` keeps
 * running, so the picture stays live (a rewind or a single frame-step is drawn)
 * without the simulation advancing. Deliberately owns no engine state: it just
 * paces the callbacks the controller supplies.
 */
export class PlaytestClock {
  private raf = 0;
  private acc = 0;
  private last = 0;
  private running = false;
  private paused = false;

  constructor(private readonly callbacks: PlaytestClockCallbacks) {}

  get isPaused(): boolean {
    return this.paused;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.paused = false;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  pause(): void {
    // Drop the accumulator so a resume does not immediately burst the ticks that
    // "elapsed" while paused.
    this.paused = true;
    this.acc = 0;
  }

  resume(): void {
    this.paused = false;
    this.last = performance.now();
    this.acc = 0;
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const elapsed = Math.min(MAX_FRAME_SECONDS, (now - this.last) / 1000);
    this.last = now;
    try {
      if (!this.paused) {
        this.acc += elapsed;
        while (this.acc >= DT) {
          this.callbacks.onStep();
          this.acc -= DT;
        }
      }
      this.callbacks.onRender();
    } catch (error) {
      this.running = false;
      this.callbacks.onError(error);
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };
}
