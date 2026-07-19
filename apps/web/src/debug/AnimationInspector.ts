import type { AnimData, AnimationLayer, Region } from "@mmx/engine/engine/Animation.js";
import { animData } from "@mmx/renderer-pixi";
import type { DebugSession } from "./DebugSession.js";

/**
 * Interactive player-animation inspector (F3).
 *
 * The panel reads the same generated atlas metadata that is loaded into the
 * engine. Changing a clip, frame, or sprite layer is deliberately treated as a
 * debug cheat: it changes simulation-visible animation state and therefore
 * taints a replay. Pausing and stepping continue to use DebugSession's normal
 * deterministic time controls.
 */
export class AnimationInspector {
  private readonly root = document.createElement("aside");
  private readonly clip = document.createElement("select");
  private readonly frame = document.createElement("input");
  private readonly frameValue = document.createElement("output");
  private readonly details = document.createElement("pre");
  private readonly history = document.createElement("ol");
  private readonly data = animData as unknown as AnimData;
  private lastState = "";
  private lastScene: object | null = null;

  constructor(private readonly session: DebugSession) {
    this.root.id = "animation-inspector";
    this.root.setAttribute("aria-label", "Animation inspector");

    const title = document.createElement("strong");
    title.textContent = "ANIMATION · F3";

    const clipLabel = document.createElement("label");
    clipLabel.textContent = "clip";
    for (const name of Object.keys(this.data.animations).sort()) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      this.clip.append(option);
    }
    clipLabel.append(this.clip);

    this.frame.type = "range";
    this.frame.min = "0";
    this.frame.step = "1";
    const frameLabel = document.createElement("label");
    frameLabel.className = "animation-frame";
    frameLabel.append("frame", this.frameValue, this.frame);

    const controls = document.createElement("div");
    controls.className = "animation-controls";
    controls.append(
      this.button("◀", "Previous frame", () => this.nudgeFrame(-1)),
      this.button("▶", "Next frame", () => this.nudgeFrame(1)),
      this.button("P", "Pause / resume", () => this.session.handleKey("KeyP")),
      this.button("+1", "Advance one simulation tick", () => this.session.handleKey("Period")),
      this.button("layer", "Toggle normal / cannon sprite sheet", () => this.toggleLayer()),
    );

    const historyTitle = document.createElement("small");
    historyTitle.textContent = "recent transitions";

    this.clip.addEventListener("change", () => this.setClip(this.clip.value));
    this.frame.addEventListener("input", () => this.setFrame(Number(this.frame.value)));

    this.root.append(title, clipLabel, frameLabel, controls, this.details, historyTitle, this.history);
    this.root.hidden = true;
    document.body.append(this.root);
  }

  /** Synchronise controls and diagnostics with the rendered simulation state. */
  update(): void {
    if (this.root.hidden !== !this.session.animationInspectorVisible) {
      this.root.hidden = !this.session.animationInspectorVisible;
    }
    if (!this.session.animationInspectorVisible) return;

    const { scene } = this.session;
    const { player } = scene;
    if (scene !== this.lastScene) {
      this.lastScene = scene;
      this.lastState = "";
      this.history.replaceChildren();
    }

    const name = player.get_animation();
    const clip = this.data.animations[name];
    const index = player.anim.frame;
    const layer = player.get_animation_layer();
    const frame = clip?.frames[index];
    const region = player.currentRegion();

    if (this.clip.value !== name) this.clip.value = name;
    const lastFrame = Math.max(0, (clip?.frames.length ?? 1) - 1);
    this.frame.max = String(lastFrame);
    this.frame.value = String(Math.min(index, lastFrame));
    this.frameValue.value = `${index} / ${lastFrame}`;

    const state = `${name} · ${layer}`;
    if (this.lastState && state !== this.lastState) {
      this.pushTransition(`${this.lastState} → ${state}`, scene.frame);
    }
    this.lastState = state;

    const durationMs = frame && clip ? (frame.duration / clip.speed) * 1000 : null;
    this.details.textContent = [
      `tick      ${scene.frame}${this.session.paused ? "  PAUSED" : ""}`,
      `clip      ${name}${clip?.loop ? "  loop" : "  once"}`,
      `rate      ${clip ? `${clip.speed} fps` : "missing"}`,
      `duration  ${durationMs === null ? "-" : `${durationMs.toFixed(2)} ms`}`,
      `layer     ${layer}`,
      `region    ${formatRegion(region)}`,
      `size      ${region ? `${region[2]} × ${region[3]} px` : "-"}`,
      `facing    ${player.get_facing_direction() > 0 ? "right" : "left"}`,
      `state     ${player.stateString()}`,
    ].join("\n");
  }

  private button(text: string, title: string, run: () => void): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.title = title;
    button.addEventListener("click", run);
    return button;
  }

  private setClip(name: string): void {
    if (!this.data.animations[name]) return;
    this.mutate(() => this.session.scene.player.play_animation(name));
  }

  private setFrame(frame: number): void {
    this.mutate(() => this.session.scene.player.set_animation_frame(frame));
  }

  private nudgeFrame(delta: number): void {
    const player = this.session.scene.player;
    const count = this.data.animations[player.get_animation()]?.frames.length ?? 1;
    this.setFrame(Math.max(0, Math.min(count - 1, player.anim.frame + delta)));
  }

  private toggleLayer(): void {
    const player = this.session.scene.player;
    const next: AnimationLayer =
      player.get_animation_layer() === "normal" ? "pointing_cannon" : "normal";
    this.mutate(() => player.set_animation_layer(next));
  }

  private mutate(change: () => void): void {
    this.session.paused = true;
    this.session.recorder.markTainted();
    change();
    this.update();
  }

  private pushTransition(text: string, tick: number): void {
    const item = document.createElement("li");
    item.textContent = `${tick}: ${text}`;
    this.history.prepend(item);
    while (this.history.children.length > 8) this.history.lastElementChild?.remove();
  }
}

function formatRegion(region: Region | null): string {
  return region ? `[${region.join(", ")}]` : "-";
}
