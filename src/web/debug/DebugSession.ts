import { decodeReplay, encodeReplay } from "../../core/Replay.js";
import { Recorder } from "../../engine/Recorder.js";
import type { Scene, SceneOptions } from "../../engine/Scene.js";
import { FrameStats } from "./FrameStats.js";

/**
 * The debug tooling's state and commands: time control, cheats, checkpoints and
 * replay I/O.
 *
 * Split from the panel that displays it and the overlay that draws it, because
 * the interesting part is none of those — it is that pausing, stepping, rewinding
 * and recording all have to agree with each other and with the fixed-step loop.
 * Keeping them in one object means the loop asks one question per frame
 * ({@link shouldStep}) instead of consulting four flags in the right order.
 */

/** Slow-motion stops, cycled by the speed keys. 1 is real time. */
const TIME_SCALES = [0.05, 0.1, 0.25, 0.5, 1] as const;

export interface DebugCommand {
  /** `KeyboardEvent.code`. */
  code: string;
  /** How the key is shown in the HUD legend. */
  label: string;
  description: string;
  run: () => void;
}

export interface DebugSessionOptions extends SceneOptions {
  /**
   * Called whenever the scene object is replaced (restart, replay load), so the
   * browser can re-attach everything that hangs off the old one — sprite clips,
   * audio subscriptions, and the cosmetic buffers that would otherwise still be
   * showing the previous run's afterimages.
   */
  onSceneReplaced: (scene: Scene) => void;
  /** Extra lines appended to the clipboard dump, for renderer-side counters. */
  extraDiagnostics?: () => Record<string, string | number>;
  /** Native dialogs on desktop, browser downloads and file inputs on the web. */
  replayFiles: ReplayFileAccess;
}

export interface ReplayText {
  path: string;
  contents: string;
}

export interface ReplayFileAccess {
  save: (contents: string, suggestedName: string) => Promise<string | null>;
  open: () => Promise<ReplayText | null>;
}

export class DebugSession {
  readonly recorder: Recorder;
  readonly stats = new FrameStats();
  readonly commands: DebugCommand[] = [];

  panelVisible = false;
  overlayVisible = false;
  paused = false;
  invulnerable = false;
  /** Index into {@link TIME_SCALES}; starts at real time. */
  private scaleIndex = TIME_SCALES.length - 1;
  /** Single-frame advances queued by the step key. */
  private pendingSteps = 0;
  /** Last thing a command did, shown in the panel so keys have visible feedback. */
  private notice = "";
  private noticeAt = 0;

  constructor(private readonly options: DebugSessionOptions) {
    this.recorder = new Recorder(options);
    this.buildCommands();
  }

  get scene(): Scene {
    return this.recorder.scene;
  }
  get timeScale(): number {
    return TIME_SCALES[this.scaleIndex];
  }

  // ---------------------------------------------------------------------------
  // Time control, as the loop consumes it
  // ---------------------------------------------------------------------------

  /**
   * Seconds of simulation time this frame's elapsed wall time is worth.
   *
   * A paused loop contributes nothing, so the accumulator does not silently fill
   * while paused and then discharge a burst of steps on resume.
   */
  scaleElapsed(seconds: number): number {
    return this.paused ? 0 : seconds * this.timeScale;
  }

  /**
   * Whether a queued single-frame advance should run, consuming it if so.
   *
   * Stepping is intentionally independent of the accumulator: the point of a
   * frame advance is to execute exactly one tick, so it bypasses the time budget
   * rather than trying to inject DT worth of wall clock into it.
   */
  shouldStep(): boolean {
    if (this.pendingSteps <= 0) return false;
    this.pendingSteps--;
    return true;
  }

  /**
   * Apply per-tick cheats. Called immediately before each fixed step so the
   * simulation sees them exactly where a gameplay system would have set them.
   */
  beforeStep(): void {
    if (!this.invulnerable) return;
    // Re-asserted every tick because Character.tick counts it down. Any positive
    // value would do; a second's worth simply survives a step with room to spare.
    this.scene.player.invulnerability = 1;
  }

  // ---------------------------------------------------------------------------
  // Commands
  // ---------------------------------------------------------------------------

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
    add("KeyP", "P", "pause / resume", () => {
      this.paused = !this.paused;
      this.say(this.paused ? "paused" : "resumed");
    });
    add("Period", ".", "advance one frame", () => {
      // Stepping implies pausing: hitting frame-advance on a running game and
      // getting one extra tick blended into 60 others is not a useful answer.
      this.paused = true;
      this.pendingSteps++;
    });
    add("BracketLeft", "[", "slower", () => this.nudgeSpeed(-1));
    add("BracketRight", "]", "faster", () => this.nudgeSpeed(1));
    add("KeyC", "C", "set checkpoint here", () => {
      this.recorder.placeCheckpoint();
      this.say(`checkpoint @ frame ${this.recorder.checkpoint}`);
    });
    add("KeyR", "R", "restart from checkpoint", () => {
      this.replaceScene(this.recorder.restart());
      this.say(`restarted @ frame ${this.scene.frame}`);
    });
    add("KeyI", "I", "toggle invulnerability", () => {
      this.invulnerable = !this.invulnerable;
      if (this.invulnerable) this.recorder.markTainted();
      else this.scene.player.invulnerability = 0;
      this.say(`invulnerable ${this.invulnerable ? "on (run tainted)" : "off"}`);
    });
    add("KeyY", "Y", "copy diagnostics", () => void this.copyDiagnostics());
    add("KeyU", "U", "save replay to file", () => this.saveReplay());
    add("KeyO", "O", "load replay from file", () => this.promptLoadReplay());
  }

  /** Dispatch a key press. Returns true when it was a debug key. */
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
    this.say(message);
  }

  /** Player death -> fresh room. Called by main.ts off the player's "death" event. */
  restartLevel(): void {
    this.replaceScene(this.recorder.restartLevel());
    this.say("you died — restarting");
  }

  private nudgeSpeed(delta: number): void {
    this.scaleIndex = Math.max(0, Math.min(TIME_SCALES.length - 1, this.scaleIndex + delta));
    this.say(`time x${this.timeScale}`);
  }

  private replaceScene(scene: Scene): void {
    this.options.onSceneReplaced(scene);
  }

  // ---------------------------------------------------------------------------
  // Replay I/O
  // ---------------------------------------------------------------------------

  private saveReplay(): void {
    const replay = this.recorder.toReplay();
    const name = `mmx-${replay.level}-${replay.frames.length}f${replay.tainted ? "-tainted" : ""}.replay.json`;
    void this.options.replayFiles
      .save(encodeReplay(replay), name)
      .then((path) => {
        if (path)
          this.say(`saved ${replay.frames.length} frames${replay.tainted ? " (tainted)" : ""}`);
      })
      .catch((error: unknown) => this.say(`save failed: ${String(error)}`));
  }

  private promptLoadReplay(): void {
    void this.options.replayFiles
      .open()
      .then((file) => {
        if (file) this.loadReplayText(file.contents, file.path);
      })
      .catch((error: unknown) => this.say(`load failed: ${String(error)}`));
  }

  loadReplayText(text: string, source = "replay"): void {
    try {
      const replay = decodeReplay(text);
      this.replaceScene(this.recorder.load(replay));
      this.paused = true;
      this.say(`loaded ${replay.frames.length} frames from ${source} — paused at the end`);
    } catch (error) {
      this.say(`load failed: ${String(error)}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Diagnostics
  // ---------------------------------------------------------------------------

  /**
   * A plain-text dump of everything the panel shows.
   *
   * Text rather than JSON because its destination is a bug report or a message
   * to someone else, where being readable without a parser matters more than
   * being machine-readable — and the machine-readable artifact for a bug is the
   * replay file, which reproduces the state instead of describing it.
   */
  diagnostics(): string {
    const { player, camera } = this.scene;
    const stats = this.stats;
    const lines: string[] = [];
    const put = (key: string, value: string | number): void => {
      lines.push(`${key.padEnd(16)} ${value}`);
    };

    lines.push(`# mmx diagnostics — ${new Date().toISOString()}`);
    lines.push("");
    lines.push("[simulation]");
    put("frame", this.scene.frame);
    put("seed", `0x${this.scene.seed.toString(16)}`);
    put("level", this.scene.levelId);
    put("digest", this.scene.digest());
    put("time scale", `x${this.timeScale}${this.paused ? " (paused)" : ""}`);
    put("invulnerable", String(this.invulnerable));

    lines.push("");
    lines.push("[loop]");
    put("fps", stats.fps.toFixed(1));
    put("frame ms", fmt(stats.summarize((s) => s.frameTime)));
    put("update ms", fmt(stats.summarize((s) => s.simulation)));
    put("render ms", fmt(stats.summarize((s) => s.rendering)));
    put("work ms", fmt(stats.summarize((s) => s.frameWork)));
    put("accumulator", `${((stats.latest?.accumulator ?? 0) * 1000).toFixed(2)} ms`);
    put("steps", stats.latest?.simulationSteps ?? 0);
    put("dropped", stats.droppedFrames);
    put("catch-up", stats.catchUpFrames);

    lines.push("");
    lines.push("[player]");
    put("position", `${player.pos.x.toFixed(2)}, ${player.pos.y.toFixed(2)}`);
    put("velocity", `${player.velocity.x.toFixed(2)}, ${player.velocity.y.toFixed(2)}`);
    put("health", `${player.current_health} / ${player.max_health}`);
    put("facing", player.get_facing_direction() > 0 ? "right" : "left");
    put("abilities", player.stateString());
    put(
      "animation",
      `${player.get_animation()} #${player.anim.frame} (${player.get_animation_layer()})`,
    );
    put("floor", String(player.is_on_floor()));
    put("ceiling", String(player.is_on_ceiling()));
    put("wall", player.is_colliding_with_wall());
    put("walljump reach", player.is_in_reach_for_walljump());
    put("projectiles", player.projectiles.length);

    lines.push("");
    lines.push("[camera]");
    put("view", `${camera.x.toFixed(1)}, ${camera.y.toFixed(1)}`);
    put("zone", camera.activeZone ? JSON.stringify(camera.activeZone) : "none");

    lines.push("");
    lines.push("[enemies]");
    for (const enemy of this.scene.stage.enemies) {
      lines.push(
        `  ${enemy.kind} @ ${enemy.pos.x.toFixed(1)},${enemy.pos.y.toFixed(1)} ` +
          `hp ${enemy.current_health}/${enemy.max_health} ` +
          `shield=${enemy.has_shield()} target=${enemy.target ? "yes" : "no"} ` +
          `[${enemy.executing_moves.map((m) => m.name).join(" ") || "-"}]`,
      );
    }
    if (this.scene.stage.enemies.length === 0) lines.push("  none");

    const extra = this.options.extraDiagnostics?.();
    if (extra) {
      lines.push("");
      lines.push("[renderer]");
      for (const [key, value] of Object.entries(extra)) put(key, value);
    }

    lines.push("");
    lines.push("[replay]");
    put("recorded", `${this.recorder.length} frames`);
    put("checkpoint", this.recorder.checkpoint);
    put("tainted", String(this.recorder.isTainted));

    return lines.join("\n");
  }

  private async copyDiagnostics(): Promise<void> {
    const text = this.diagnostics();
    try {
      await navigator.clipboard.writeText(text);
      this.say("diagnostics copied");
    } catch {
      // Clipboard access needs a secure context and can be denied outright, so
      // the console is the fallback — the data is what matters, not the route.
      console.log(text);
      this.say("clipboard denied — dumped to console");
    }
  }

  // ---------------------------------------------------------------------------

  private say(message: string): void {
    this.notice = message;
    this.noticeAt = performance.now();
  }

  /** The current transient message, or "" once it has aged out. */
  currentNotice(now: number): string {
    return now - this.noticeAt < 2500 ? this.notice : "";
  }
}

function fmt(summary: { median: number; p95: number; worst: number }): string {
  return `${summary.median.toFixed(1)} / ${summary.p95.toFixed(1)} / ${summary.worst.toFixed(1)}`;
}
