import { describeInput } from "../../core/Replay.js";
import type { DebugSession } from "./DebugSession.js";
import { formatSummary, SAMPLE_COUNT, type FrameStats } from "./FrameStats.js";

/**
 * The on-screen debug panel.
 *
 * DOM rather than drawn into the Pixi scene, deliberately. The game renders at
 * 384x224 scaled by an integer factor, so any text drawn inside it is either
 * unreadable at 1x or blown up to a size that covers the play area — and the one
 * thing a debug HUD must not do is hide the thing being debugged. An overlaid DOM
 * element renders at native resolution, is selectable, and costs the GPU nothing.
 *
 * The panel is a *reader*: it never touches simulation state, so leaving it open
 * cannot change what the game does. Its only side effect is the repaint, which is
 * throttled — updating twelve text nodes at 60Hz measurably outweighs the frame
 * work of this game, and numbers flickering that fast are unreadable anyway.
 */

const REPAINT_INTERVAL_MS = 100;
const GRAPH_WIDTH = 240;
const GRAPH_HEIGHT = 56;

/** Frame-time ceiling of the graph: two 60Hz frames, so a dropped frame is off-scale. */
const GRAPH_CEILING_MS = 33.34;

export class DebugPanel {
  private readonly root = document.createElement("aside");
  private readonly graph = document.createElement("canvas");
  private readonly body = document.createElement("pre");
  private readonly notice = document.createElement("div");
  private readonly legend = document.createElement("details");
  private lastRepaint = 0;

  constructor(private readonly session: DebugSession) {
    this.root.id = "debug-panel";
    this.root.setAttribute("aria-label", "Debug HUD");

    const title = document.createElement("strong");
    title.textContent = "DEBUG";
    const hint = document.createElement("small");
    hint.textContent = "median / p95 / worst (ms)";

    this.graph.width = GRAPH_WIDTH;
    this.graph.height = GRAPH_HEIGHT;

    const summary = document.createElement("summary");
    summary.textContent = "keys";
    this.legend.append(summary);
    for (const command of session.commands) {
      const row = document.createElement("div");
      row.textContent = `${command.label.padEnd(3)} ${command.description}`;
      this.legend.append(row);
    }

    this.root.append(title, hint, this.graph, this.body, this.notice, this.legend);
    this.root.hidden = true;
    document.body.append(this.root);
  }

  /** Repaint if visible and due. Called once per rendered frame. */
  update(now: number): void {
    if (this.root.hidden !== !this.session.panelVisible) {
      this.root.hidden = !this.session.panelVisible;
    }
    if (!this.session.panelVisible) return;

    // The notice is the feedback for a keypress, so it is not throttled — a
    // command that appeared to do nothing for a tenth of a second reads as broken.
    this.notice.textContent = this.session.currentNotice(now);

    if (now - this.lastRepaint < REPAINT_INTERVAL_MS) return;
    this.lastRepaint = now;
    this.body.textContent = this.text();
    this.paintGraph(this.session.stats);
  }

  private text(): string {
    const { scene, stats, recorder } = this.session;
    const { player, camera } = scene;
    const latest = stats.latest;
    const contacts = [
      player.is_on_floor() ? "floor" : "",
      player.is_on_ceiling() ? "ceil" : "",
      player.is_colliding_with_wall() ? `wall${sign(player.is_colliding_with_wall())}` : "",
      player.is_in_reach_for_walljump() ? `reach${sign(player.is_in_reach_for_walljump())}` : "",
    ].filter(Boolean);

    const liveShots = player.projectiles.filter((p) => p.isLive).length;
    const speed = this.session.paused ? "PAUSED" : `x${this.session.timeScale}`;

    return [
      `fps    ${stats.fps.toFixed(1).padStart(6)}   ${speed}${this.session.invulnerable ? "  INVULN" : ""}`,
      `frame  ${formatSummary(stats.summarize((s) => s.frameTime))}`,
      `update ${formatSummary(stats.summarize((s) => s.simulation))}`,
      `render ${formatSummary(stats.summarize((s) => s.rendering))}`,
      `work   ${formatSummary(stats.summarize((s) => s.frameWork))}`,
      "",
      `tick   ${scene.frame}   steps ${latest?.simulationSteps ?? 0}   acc ${((latest?.accumulator ?? 0) * 1000).toFixed(2)}ms`,
      `seed   0x${scene.seed.toString(16)}   dropped ${stats.droppedFrames}   catchup ${stats.catchUpFrames}`,
      "",
      `pos    ${pair(player.pos.x, player.pos.y)}`,
      `vel    ${pair(player.velocity.x, player.velocity.y)}`,
      `hp     ${player.current_health}/${player.max_health}   facing ${player.get_facing_direction() > 0 ? "R" : "L"}`,
      `touch  ${contacts.join(" ") || "-"}`,
      `state  ${player.stateString()}`,
      `clip   ${player.get_animation()} #${player.anim.frame}${player.get_animation_layer() === "pointing_cannon" ? " (cannon)" : ""}`,
      `shots  ${liveShots} live / ${player.projectiles.length} total`,
      "",
      `cam    ${pair(camera.x, camera.y)}   zone ${zoneLabel(camera)}`,
      `foes   ${scene.stage.enemies.map(enemyLabel).join("  ") || "none"}`,
      "",
      `input  ${describeInput(recorder.lastMask)}`,
      `replay ${recorder.length}f  cp ${recorder.checkpoint}${recorder.isTainted ? "  TAINTED" : ""}`,
    ].join("\n");
  }

  /**
   * Frame-time history, with the 60Hz and 30Hz budgets marked.
   *
   * A graph and not just numbers because the shape is the diagnosis: a flat line
   * with occasional spikes is GC or asset work, a periodic sawtooth is a leak
   * building up and being collected, and a step change is something that turned
   * on. Percentiles collapse all three into the same pair of numbers.
   */
  private paintGraph(stats: FrameStats): void {
    const ctx = this.graph.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#071018";
    ctx.fillRect(0, 0, GRAPH_WIDTH, GRAPH_HEIGHT);

    const y = (ms: number): number =>
      GRAPH_HEIGHT - Math.min(GRAPH_HEIGHT, (ms / GRAPH_CEILING_MS) * GRAPH_HEIGHT);

    for (const [budget, color] of [
      [16.67, "#395564"],
      [33.34, "#6a3940"],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, y(budget) + 0.5);
      ctx.lineTo(GRAPH_WIDTH, y(budget) + 0.5);
      ctx.stroke();
    }

    // Update time under the frame line: the gap between them is render plus
    // browser overhead, which is the first thing you want to see when a frame
    // budget is being missed.
    const history = stats.history;
    const x = (index: number): number => GRAPH_WIDTH - SAMPLE_COUNT + index + 0.5;

    for (const [pick, color] of [
      [(s: (typeof history)[number]) => s.simulation, "#f0a35e"],
      [(s: (typeof history)[number]) => s.frameTime, "#61dafb"],
    ] as const) {
      ctx.strokeStyle = color;
      ctx.beginPath();
      history.forEach((sample, index) => {
        const py = y(pick(sample));
        if (index === 0) ctx.moveTo(x(index), py);
        else ctx.lineTo(x(index), py);
      });
      ctx.stroke();
    }
  }
}

function pair(a: number, b: number): string {
  return `${a.toFixed(2).padStart(8)}, ${b.toFixed(2).padStart(8)}`;
}

function sign(v: number): string {
  return v > 0 ? "+" : "-";
}

function zoneLabel(camera: {
  activeZone: { x: number; y: number; w: number; h: number } | null;
}): string {
  const z = camera.activeZone;
  return z ? `${z.x},${z.y} ${z.w}x${z.h}` : "none";
}

function enemyLabel(enemy: {
  kind: string;
  current_health: number;
  target: unknown;
  has_shield: () => boolean;
}): string {
  const flags = [enemy.target ? "!" : "", enemy.has_shield() ? "#" : ""].join("");
  return `${enemy.kind}:${enemy.current_health}${flags}`;
}
