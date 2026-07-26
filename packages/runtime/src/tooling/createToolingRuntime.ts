import { DT, FrameStats, type Action, type SceneOptions } from "@mmx/engine";
import type { SimulationSnapshot } from "@mmx/engine/tooling";
import {
  RuntimeSession,
  type RuntimeAudio,
  type RuntimeInspect,
  type RuntimePresentation,
  type RuntimeSessionOptions,
} from "../core/index.js";
import { BrowserInput, type BrowserInputBindings } from "../browser/BrowserInput.js";
import type { GetGamepads } from "../browser/GamepadInput.js";
import type {
  FixedStepFrameStats,
  FixedStepLoop,
} from "../browser/FixedStepLoop.js";

export const TOOLING_BINDINGS: BrowserInputBindings = {
  move_left: ["ArrowLeft", "KeyA"],
  move_right: ["ArrowRight", "KeyD"],
  move_up: ["ArrowUp", "KeyW"],
  move_down: ["ArrowDown", "KeyS"],
  jump: ["Space", "KeyZ"],
  dash: ["KeyK", "KeyX", "ShiftLeft"],
  fire: ["KeyC", "KeyJ"],
  weapon_left: ["KeyQ"],
  weapon_right: ["KeyE"],
};

export interface CreateToolingRuntimeOptions extends RuntimeSessionOptions {
  getGamepads?: GetGamepads;
  onError?: (error: unknown) => void;
}

export interface ToolingRuntime {
  readonly session: RuntimeSession;
  readonly frameStats: FrameStats;
  readonly isPaused: boolean;
  step(mask?: number): SimulationSnapshot;
  inspect(): RuntimeInspect;
  setAction(action: Action, down: boolean): void;
  clearInput(): void;
  toMask(): number;
  setCheckpoint(): void;
  restartCheckpoint(): SimulationSnapshot;
  restartLevel(): SimulationSnapshot;
  seek(frame: number): SimulationSnapshot;
  replaceScene(options?: SceneOptions): SimulationSnapshot;
  setPresentation(presentation: RuntimePresentation | undefined): void;
  setAudio(audio: RuntimeAudio | undefined): void;
  render(): void;
  /**
   * Attaches browser input listeners and starts the fixed-step loop. Dynamic
   * import keeps requestAnimationFrame out of headless sessions until called.
   */
  startBrowser(): Promise<void>;
  stopBrowser(): void;
  togglePause(): void;
  pause(): void;
  resume(): void;
  dispose(): void;
}

export function createToolingRuntime(
  options: CreateToolingRuntimeOptions = {},
): ToolingRuntime {
  return new ToolingRuntimeImpl(options);
}

class ToolingRuntimeImpl implements ToolingRuntime {
  readonly session: RuntimeSession;
  frameStats = new FrameStats();

  private readonly input: BrowserInput;
  private clock: FixedStepLoop | null = null;
  private readonly onError?: (error: unknown) => void;

  constructor(options: CreateToolingRuntimeOptions) {
    this.session = new RuntimeSession(options);
    this.onError = options.onError;
    this.input = new BrowserInput({
      getBindings: () => TOOLING_BINDINGS,
      getGamepads: options.getGamepads,
    });
  }

  get isPaused(): boolean {
    return this.clock?.isPaused ?? false;
  }

  step(mask?: number): SimulationSnapshot {
    if (this.clock && !this.clock.isPaused) {
      return this.session.inspect().simulation;
    }
    const snap = this.session.step(mask ?? this.toMask());
    this.session.render();
    return snap;
  }

  inspect(): RuntimeInspect {
    return this.session.inspect();
  }

  setAction(action: Action, down: boolean): void {
    this.input.set(action, down);
  }

  clearInput(): void {
    this.input.reset();
  }

  toMask(): number {
    return this.input.toMask();
  }

  setCheckpoint(): void {
    this.session.setCheckpoint();
  }

  restartCheckpoint(): SimulationSnapshot {
    return this.session.restartCheckpoint();
  }

  restartLevel(): SimulationSnapshot {
    return this.session.restartLevel();
  }

  seek(frame: number): SimulationSnapshot {
    return this.session.seek(frame);
  }

  replaceScene(options: SceneOptions = {}): SimulationSnapshot {
    return this.session.replaceScene(options);
  }

  setPresentation(presentation: RuntimePresentation | undefined): void {
    this.session.setPresentation(presentation);
  }

  setAudio(audio: RuntimeAudio | undefined): void {
    this.session.setAudio(audio);
  }

  render(): void {
    this.session.render();
  }

  async startBrowser(): Promise<void> {
    if (this.clock?.isRunning) return;

    const { FixedStepLoop } = await import("../browser/FixedStepLoop.js");

    this.frameStats = new FrameStats();
    this.input.attach();

    this.clock = new FixedStepLoop({
      stepSeconds: DT,
      maxFrameSeconds: 0.25,
      onFrameStart: (frame) => {
        this.input.poll(Math.min(frame.rawElapsedSeconds, frame.maxFrameSeconds));
      },
      onStep: () => {
        this.session.step(this.toMask());
      },
      onRender: () => {
        this.session.render();
      },
      onFrameStats: (frame) => this.recordFrameStats(frame),
      onError: (error) => {
        this.stopBrowser();
        this.onError?.(error);
      },
    });
    this.clock.start();
  }

  stopBrowser(): void {
    this.clock?.stop();
    this.clock = null;
    this.input.detach();
  }

  togglePause(): void {
    if (!this.clock) return;
    if (this.clock.isPaused) this.resume();
    else this.pause();
  }

  pause(): void {
    this.clock?.pause();
    this.clearInput();
  }

  resume(): void {
    this.clock?.resume();
  }

  dispose(): void {
    this.stopBrowser();
    this.session.dispose();
  }

  private recordFrameStats(frame: FixedStepFrameStats): void {
    if (!frame.paused) {
      this.frameStats.addDiscardedSeconds(frame.rawElapsedSeconds - frame.elapsedSeconds);
    }
    this.frameStats.record({
      frameTime: frame.rawElapsedSeconds * 1000,
      simulation: frame.simulationMs,
      rendering: frame.renderingMs,
      frameWork: frame.frameWorkMs,
      simulationSteps: frame.simulationSteps,
      accumulator: frame.accumulatorSeconds,
    });
  }
}
