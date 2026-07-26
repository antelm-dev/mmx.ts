import { DT } from "@mmx/engine/core/constants.js";

const MAX_FRAME_SECONDS = 0.25;

export interface PlaytestClockCallbacks {
  onStep: () => void;
  onRender: () => void;
  onError: (error: unknown) => void;
}

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
