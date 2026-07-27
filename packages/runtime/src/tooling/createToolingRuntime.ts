import {
  DT,
  type Action,
  type LevelData,
  type Replay,
  type SceneOptions,
} from "@mmx/engine";
import type { SimulationSnapshot } from "@mmx/engine/tooling";
import {
  RuntimeSession,
  type RuntimeAudio,
  type RuntimeInspect,
  type RuntimePresentation,
  type RuntimeSessionOptions,
} from "../core/index.js";
import {
  BrowserInput,
  DEFAULT_TOOLING_BINDINGS,
  isEditableKeyTarget,
  type BrowserInputBindings,
  type BrowserInputOptions,
  type GetGamepads,
} from "@mmx/browser-input";
import {
  FixedStepLoop,
  type FixedStepFrameStats,
} from "../browser/FixedStepLoop.js";
import {
  createRuntimeDebugHost,
  DebugController,
  type ClipboardAccess,
  type DebugSnapshot,
  type ReplayFileAccess,
} from "../debug/index.js";

export const TOOLING_BINDINGS: BrowserInputBindings = DEFAULT_TOOLING_BINDINGS;

export interface CreateToolingRuntimeOptions extends RuntimeSessionOptions {
  getBindings?: () => BrowserInputBindings;
  getGamepads?: GetGamepads;
  beforeKeyDown?: BrowserInputOptions["beforeKeyDown"];
  onError?: (error: unknown) => void;
  replayFiles?: ReplayFileAccess;
  clipboard?: ClipboardAccess;
  extraDiagnostics?: () => Record<string, string | number>;
}

export interface ToolingRuntime {
  readonly session: RuntimeSession;
  readonly debug: DebugController;
  readonly frameStats: DebugController["stats"];
  readonly isPaused: boolean;
  step(mask?: number): SimulationSnapshot;
  inspect(): RuntimeInspect;
  debugSnapshot(): DebugSnapshot;
  setAction(action: Action, down: boolean): void;
  clearInput(): void;
  toMask(): number;
  setCheckpoint(): void;
  restartCheckpoint(): SimulationSnapshot;
  restartLevel(): SimulationSnapshot;
  seek(frame: number): SimulationSnapshot;
  loadLevel(level: LevelData): SimulationSnapshot;
  markTainted(): void;
  toReplay(): Replay;
  loadReplay(replay: Replay): SimulationSnapshot;
  loadReplayText(text: string, source?: string): void;
  saveReplay(): void;
  promptLoadReplay(): void;
  setInvulnerable(enabled: boolean): void;
  setTimeScale(scale: number): void;
  nudgeTimeScale(delta: number): void;
  copyDiagnostics(): Promise<void>;
  diagnostics(): string;
  replaceScene(options?: SceneOptions): SimulationSnapshot;
  setPresentation(presentation: RuntimePresentation | undefined): void;
  setAudio(audio: RuntimeAudio | undefined): void;
  render(): void;
  /**
   * Attaches browser input listeners and starts the fixed-step loop.
   * Safe to skip in headless sessions — scheduling only begins when called.
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
  readonly debug: DebugController;

  private readonly input: BrowserInput;
  private clock: FixedStepLoop | null = null;
  private readonly onError?: (error: unknown) => void;

  constructor(options: CreateToolingRuntimeOptions) {
    this.session = new RuntimeSession(options);
    this.onError = options.onError;
    this.debug = new DebugController({
      host: createRuntimeDebugHost(this.session),
      replayFiles: options.replayFiles,
      clipboard: options.clipboard,
      extraDiagnostics: options.extraDiagnostics,
    });
    this.input = new BrowserInput({
      getBindings: options.getBindings ?? (() => TOOLING_BINDINGS),
      getGamepads: options.getGamepads,
      beforeKeyDown: (e) => {
        if (options.beforeKeyDown?.(e)) return true;
        return isEditableKeyTarget(e.target);
      },
    });
  }

  get frameStats() {
    return this.debug.stats;
  }

  get isPaused(): boolean {
    return this.debug.isPaused;
  }

  step(mask?: number): SimulationSnapshot {
    if (this.clock && !this.debug.isPaused) {
      return this.session.inspect().simulation;
    }
    this.debug.beforeStep();
    const snap = this.session.step(mask ?? this.toMask());
    this.session.render();
    return snap;
  }

  inspect(): RuntimeInspect {
    return this.session.inspect();
  }

  debugSnapshot(): DebugSnapshot {
    return this.debug.snapshot();
  }

  setAction(action: Action, down: boolean): void {
    this.input.set(action, down);
  }

  clearInput(): void {
    this.input.clear();
  }

  toMask(): number {
    return this.input.toMask();
  }

  setCheckpoint(): void {
    this.debug.setCheckpoint();
  }

  restartCheckpoint(): SimulationSnapshot {
    this.debug.restartCheckpoint();
    return this.session.inspect().simulation;
  }

  restartLevel(): SimulationSnapshot {
    this.debug.restartLevel();
    return this.session.inspect().simulation;
  }

  seek(frame: number): SimulationSnapshot {
    this.debug.seek(frame);
    return this.session.inspect().simulation;
  }

  loadLevel(level: LevelData): SimulationSnapshot {
    this.debug.loadLevel(level);
    return this.session.inspect().simulation;
  }

  markTainted(): void {
    this.session.markTainted();
  }

  toReplay(): Replay {
    return this.session.toReplay();
  }

  loadReplay(replay: Replay): SimulationSnapshot {
    this.session.loadReplay(replay);
    this.debug.setPaused(true);
    this.debug.notify(
      `loaded ${replay.frames.length} frames — paused at the end`,
    );
    return this.session.inspect().simulation;
  }

  loadReplayText(text: string, source?: string): void {
    this.debug.loadReplayText(text, source);
  }

  saveReplay(): void {
    this.debug.saveReplay();
  }

  promptLoadReplay(): void {
    this.debug.promptLoadReplay();
  }

  setInvulnerable(enabled: boolean): void {
    this.debug.setInvulnerable(enabled);
  }

  setTimeScale(scale: number): void {
    this.debug.setTimeScale(scale);
  }

  nudgeTimeScale(delta: number): void {
    this.debug.nudgeTimeScale(delta);
  }

  copyDiagnostics(): Promise<void> {
    return this.debug.copyDiagnostics();
  }

  diagnostics(): string {
    return this.debug.diagnostics();
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

    this.input.attach();

    this.clock = new FixedStepLoop({
      stepSeconds: DT,
      maxFrameSeconds: 0.25,
      onFrameStart: (frame) => {
        this.input.poll(Math.min(frame.rawElapsedSeconds, frame.maxFrameSeconds));
        const elapsed = this.debug.scaleElapsed(
          Math.min(frame.rawElapsedSeconds, frame.maxFrameSeconds),
        );
        return { elapsedSeconds: elapsed };
      },
      onStep: () => {
        this.debug.beforeStep();
        this.session.step(this.toMask());
      },
      onRender: () => {
        while (this.debug.shouldStep()) {
          this.debug.beforeStep();
          this.session.step(this.toMask());
        }
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
    this.debug.togglePause();
    if (this.debug.isPaused) this.clearInput();
  }

  pause(): void {
    this.debug.pause();
    this.clearInput();
  }

  resume(): void {
    this.debug.resume();
  }

  dispose(): void {
    this.stopBrowser();
    this.session.dispose();
  }

  private recordFrameStats(frame: FixedStepFrameStats): void {
    if (!this.debug.isPaused) {
      this.debug.stats.addDiscardedSeconds(frame.rawElapsedSeconds - frame.elapsedSeconds);
    }
    this.debug.stats.record({
      frameTime: frame.rawElapsedSeconds * 1000,
      simulation: frame.simulationMs,
      rendering: frame.renderingMs,
      frameWork: frame.frameWorkMs,
      simulationSteps: frame.simulationSteps,
      accumulator: frame.accumulatorSeconds,
    });
  }
}
