import { Recorder, type LevelData, type Scene, type SceneOptions } from "@mmx/engine";
import {
  createRecorderDebugHost,
  DebugController,
  type ReplayFileAccess,
  type ReplayText,
} from "@mmx/runtime/debug";

export type { ReplayFileAccess, ReplayText };

/**
 * Web-facing debug session: owns the {@link Recorder}, composes the shared
 * {@link DebugController}, and keeps DOM-only UI flags plus keyboard bindings.
 */
export interface DebugCommand {
  code: string;
  label: string;
  description: string;
  run: () => void;
}

export interface DebugSessionOptions extends SceneOptions {
  onSceneReplaced: (scene: Scene) => void;
  extraDiagnostics?: () => Record<string, string | number>;
  replayFiles: ReplayFileAccess;
}

export class DebugSession {
  readonly recorder: Recorder;
  readonly commands: DebugCommand[] = [];
  readonly debug: DebugController;

  panelVisible = false;
  overlayVisible = false;
  animationInspectorVisible = false;

  constructor(private readonly options: DebugSessionOptions) {
    this.recorder = new Recorder(options);
    this.debug = new DebugController({
      host: createRecorderDebugHost(this.recorder, options.onSceneReplaced),
      replayFiles: options.replayFiles,
      clipboard: {
        writeText: (text) => navigator.clipboard.writeText(text),
      },
      extraDiagnostics: options.extraDiagnostics,
    });
    this.buildCommands();
  }

  get stats() {
    return this.debug.stats;
  }

  get scene(): Scene {
    return this.recorder.scene;
  }

  get timeScale(): number {
    return this.debug.timeScale;
  }

  get paused(): boolean {
    return this.debug.isPaused;
  }

  set paused(value: boolean) {
    this.debug.setPaused(value);
  }

  get invulnerable(): boolean {
    return this.debug.isInvulnerable;
  }

  set invulnerable(value: boolean) {
    this.debug.setInvulnerable(value);
  }

  scaleElapsed(seconds: number): number {
    return this.debug.scaleElapsed(seconds);
  }

  shouldStep(): boolean {
    return this.debug.shouldStep();
  }

  beforeStep(): void {
    this.debug.beforeStep();
  }

  private buildCommands(): void {
    const add = (code: string, label: string, description: string, run: () => void): void => {
      this.commands.push({ code, label, description, run });
    };

    add("F1", "F1", "toggle this panel", () => {
      this.panelVisible = !this.panelVisible;
    });
    add("F2", "F2", "toggle shape overlay", () => {
      this.overlayVisible = !this.overlayVisible;
    });
    add("F3", "F3", "toggle animation inspector", () => {
      this.animationInspectorVisible = !this.animationInspectorVisible;
      this.debug.notify(
        `animation inspector ${this.animationInspectorVisible ? "open" : "closed"}`,
      );
    });
    add("KeyP", "P", "pause / resume", () => this.debug.togglePause());
    add("Period", ".", "advance one frame", () => this.debug.step());
    add("BracketLeft", "[", "slower", () => this.debug.nudgeTimeScale(-1));
    add("BracketRight", "]", "faster", () => this.debug.nudgeTimeScale(1));
    add("KeyC", "C", "set checkpoint here", () => this.debug.setCheckpoint());
    add("KeyR", "R", "restart from checkpoint", () => this.debug.restartCheckpoint());
    add("KeyI", "I", "toggle invulnerability", () => this.debug.toggleInvulnerable());
    add("KeyY", "Y", "copy diagnostics", () => void this.debug.copyDiagnostics());
    add("KeyU", "U", "save replay to file", () => this.debug.saveReplay());
    add("KeyO", "O", "load replay from file", () => this.debug.promptLoadReplay());
  }

  handleKey(code: string): boolean {
    const command = this.commands.find((c) => c.code === code);
    if (!command) return false;
    command.run();
    return true;
  }

  registerCommand(command: DebugCommand): void {
    this.commands.push(command);
  }

  notify(message: string): void {
    this.debug.notify(message);
  }

  restartLevel(): void {
    this.debug.restartLevel();
    this.debug.notify("you died — restarting");
  }

  loadLevel(level: LevelData): void {
    this.debug.loadLevel(level);
  }

  loadReplayText(text: string, source = "replay"): void {
    this.debug.loadReplayText(text, source);
  }

  diagnostics(): string {
    return this.debug.diagnostics();
  }

  currentNotice(now: number): string {
    return this.debug.currentNotice(now);
  }
}
