import { DT, FrameStats, type FrameStatsSnapshot } from "@mmx/engine";

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
  private readonly stats = new FrameStats();

  constructor(private readonly callbacks: PlaytestClockCallbacks) {}

  get isPaused(): boolean {
    return this.paused;
  }

  /** Immutable summarized frame timings for the current collector state. */
  frameStatsSnapshot(): FrameStatsSnapshot {
    return this.stats.toSnapshot();
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
    const rawElapsedSeconds = (now - this.last) / 1000;
    const frameTimeMs = now - this.last;
    this.last = now;

    let simulationSteps = 0;
    let simulationMs = 0;
    let renderingMs = 0;

    try {
      if (!this.paused) {
        this.stats.addDiscardedSeconds(rawElapsedSeconds - MAX_FRAME_SECONDS);
        const elapsed = Math.min(MAX_FRAME_SECONDS, rawElapsedSeconds);
        this.acc += elapsed;
        const simStart = performance.now();
        while (this.acc >= DT) {
          this.callbacks.onStep();
          this.acc -= DT;
          simulationSteps++;
        }
        simulationMs = performance.now() - simStart;
      }

      const renderStart = performance.now();
      this.callbacks.onRender();
      renderingMs = performance.now() - renderStart;

      this.stats.record({
        frameTime: frameTimeMs,
        simulation: simulationMs,
        rendering: renderingMs,
        frameWork: simulationMs + renderingMs,
        simulationSteps,
        accumulator: this.acc,
      });
    } catch (error) {
      this.running = false;
      this.callbacks.onError(error);
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };
}
