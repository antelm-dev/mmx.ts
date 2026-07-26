import { decodeReplay, encodeReplay, FrameStats, type LevelData } from "@mmx/engine";
import type {
  ClipboardAccess,
  DebugControllerOptions,
  DebugSimulationHost,
  DebugSnapshot,
  ReplayFileAccess,
  TimeScale,
} from "./types.js";
import { TIME_SCALES } from "./types.js";

const NOTICE_MS = 2500;

/**
 * UI-independent debug controller: time control, checkpoints, rewind, replay
 * I/O, cheats, and diagnostics. Clients bind their own keyboards and views to
 * the semantic methods and {@link snapshot}.
 */
export class DebugController {
  readonly stats = new FrameStats();

  private host: DebugSimulationHost;
  private readonly replayFiles?: ReplayFileAccess;
  private readonly clipboard?: ClipboardAccess;
  private readonly extraDiagnostics?: () => Record<string, string | number>;
  private readonly now: () => number;

  private paused = false;
  private invulnerable = false;
  private scaleIndex = TIME_SCALES.length - 1;
  private pendingSteps = 0;
  private notice = "";
  private noticeAt = 0;

  constructor(options: DebugControllerOptions) {
    this.host = options.host;
    this.replayFiles = options.replayFiles;
    this.clipboard = options.clipboard;
    this.extraDiagnostics = options.extraDiagnostics;
    this.now = options.now ?? (() => performance.now());
  }

  get scene() {
    return this.host.scene;
  }

  get timeScale(): TimeScale {
    return TIME_SCALES[this.scaleIndex]!;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  get isInvulnerable(): boolean {
    return this.invulnerable;
  }

  setHost(host: DebugSimulationHost): void {
    this.host = host;
  }

  scaleElapsed(seconds: number): number {
    return this.paused ? 0 : seconds * this.timeScale;
  }

  shouldStep(): boolean {
    if (this.pendingSteps <= 0) return false;
    this.pendingSteps--;
    return true;
  }

  beforeStep(): void {
    if (!this.invulnerable) return;
    this.host.scene.player.invulnerability = 1;
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.say(this.paused ? "paused" : "resumed");
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.say("paused");
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.say("resumed");
  }

  step(): void {
    this.paused = true;
    this.pendingSteps++;
  }

  setTimeScale(scale: number): void {
    const index = TIME_SCALES.indexOf(scale as TimeScale);
    if (index < 0) {
      throw new Error(`unsupported time scale ${scale}; expected one of ${TIME_SCALES.join(", ")}`);
    }
    this.scaleIndex = index;
    this.say(`time x${this.timeScale}`);
  }

  nudgeTimeScale(delta: number): void {
    this.scaleIndex = Math.max(0, Math.min(TIME_SCALES.length - 1, this.scaleIndex + delta));
    this.say(`time x${this.timeScale}`);
  }

  setCheckpoint(): void {
    this.host.setCheckpoint();
    this.say(`checkpoint @ frame ${this.host.checkpointFrame}`);
  }

  restartCheckpoint(): void {
    this.host.restartCheckpoint();
    this.say(`restarted @ frame ${this.host.frame}`);
  }

  restartLevel(): void {
    this.host.restartLevel();
    this.say("restarting level");
  }

  seek(frame: number): void {
    this.host.seek(frame);
    this.paused = true;
    this.pendingSteps = 0;
    this.say(`seek @ frame ${this.host.frame}`);
  }

  setInvulnerable(enabled: boolean): void {
    this.invulnerable = enabled;
    if (enabled) this.host.markTainted();
    else this.host.scene.player.invulnerability = 0;
    this.say(`invulnerable ${enabled ? "on (run tainted)" : "off"}`);
  }

  toggleInvulnerable(): void {
    this.setInvulnerable(!this.invulnerable);
  }

  loadLevel(level: LevelData): void {
    this.paused = false;
    this.pendingSteps = 0;
    this.host.loadLevel(level);
    this.say(`loaded ${level.identifier}`);
  }

  notify(message: string): void {
    this.say(message);
  }

  currentNotice(at = this.now()): string {
    return at - this.noticeAt < NOTICE_MS ? this.notice : "";
  }

  snapshot(at = this.now()): DebugSnapshot {
    return {
      status: this.paused ? "paused" : "running",
      paused: this.paused,
      frame: this.host.frame,
      checkpointFrame: this.host.checkpointFrame,
      recordedLength: this.host.recordedLength,
      timeScale: this.timeScale,
      invulnerable: this.invulnerable,
      tainted: this.host.isTainted,
      lastMask: this.host.lastMask,
      notice: this.currentNotice(at),
    };
  }

  saveReplay(): void {
    const files = this.replayFiles;
    if (!files) {
      this.say("replay save unavailable");
      return;
    }
    const replay = this.host.toReplay();
    const name = `mmx-${replay.level}-${replay.frames.length}f${replay.tainted ? "-tainted" : ""}.replay.json`;
    void files
      .save(encodeReplay(replay), name)
      .then((path) => {
        if (path)
          this.say(`saved ${replay.frames.length} frames${replay.tainted ? " (tainted)" : ""}`);
      })
      .catch((error: unknown) => this.say(`save failed: ${String(error)}`));
  }

  promptLoadReplay(): void {
    const files = this.replayFiles;
    if (!files) {
      this.say("replay load unavailable");
      return;
    }
    void files
      .open()
      .then((file) => {
        if (file) this.loadReplayText(file.contents, file.path);
      })
      .catch((error: unknown) => this.say(`load failed: ${String(error)}`));
  }

  loadReplayText(text: string, source = "replay"): void {
    try {
      const replay = decodeReplay(text);
      this.host.loadReplay(replay);
      this.paused = true;
      this.pendingSteps = 0;
      this.say(`loaded ${replay.frames.length} frames from ${source} — paused at the end`);
    } catch (error) {
      this.say(`load failed: ${String(error)}`);
    }
  }

  diagnostics(): string {
    const { player, camera } = this.host.scene;
    const stats = this.stats;
    const lines: string[] = [];
    const put = (key: string, value: string | number): void => {
      lines.push(`${key.padEnd(16)} ${value}`);
    };

    lines.push(`# mmx diagnostics — ${new Date().toISOString()}`);
    lines.push("");
    lines.push("[simulation]");
    put("frame", this.host.scene.frame);
    put("seed", `0x${this.host.scene.seed.toString(16)}`);
    put("level", this.host.scene.levelId);
    put("digest", this.host.scene.digest());
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
    for (const enemy of this.host.scene.stage.enemies) {
      lines.push(
        `  ${enemy.kind} @ ${enemy.pos.x.toFixed(1)},${enemy.pos.y.toFixed(1)} ` +
          `hp ${enemy.current_health}/${enemy.max_health} ` +
          `shield=${enemy.has_shield()} target=${enemy.target ? "yes" : "no"} ` +
          `[${enemy.executing_moves.map((m) => m.name).join(" ") || "-"}]`,
      );
    }
    if (this.host.scene.stage.enemies.length === 0) lines.push("  none");

    const extra = this.extraDiagnostics?.();
    if (extra) {
      lines.push("");
      lines.push("[renderer]");
      for (const [key, value] of Object.entries(extra)) put(key, value);
    }

    lines.push("");
    lines.push("[replay]");
    put("recorded", `${this.host.recordedLength} frames`);
    put("checkpoint", this.host.checkpointFrame);
    put("tainted", String(this.host.isTainted));

    return lines.join("\n");
  }

  async copyDiagnostics(): Promise<void> {
    const text = this.diagnostics();
    if (!this.clipboard) {
      this.say("clipboard unavailable");
      return;
    }
    try {
      await this.clipboard.writeText(text);
      this.say("diagnostics copied");
    } catch {
      this.say("clipboard denied");
    }
  }

  private say(message: string): void {
    this.notice = message;
    this.noticeAt = this.now();
  }
}

function fmt(summary: { median: number; p95: number; worst: number }): string {
  return `${summary.median.toFixed(1)} / ${summary.p95.toFixed(1)} / ${summary.worst.toFixed(1)}`;
}
