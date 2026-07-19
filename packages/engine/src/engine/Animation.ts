/**
 * Port of Godot's AnimatedSprite playback, minus the drawing — the part the
 * gameplay code actually talks to (`play_animation`, `get_animation`, `set_frame`,
 * the `animation_finished` signal and the SpriteFrames swap done while shooting).
 *
 * It lives in the engine rather than the renderer because the original's abilities
 * *read* animation state: `Movement.change_animation_if_falling` checks
 * `get_animation() != "fall"`, `Walk` advances walk_start -> walk on
 * `animation_finished`, and `IdleWeak` settles recover -> idle/weak the same way.
 *
 * Clip data (x_anims.json, exported from the game's SpriteFrames) is *optional*:
 * the headless sim and tests run without it, in which case a clip has no frames and
 * finishes on the next tick, so animation-driven handoffs still resolve and
 * `get_animation()` behaves as the plain string it was before.
 *
 * Godot bakes per-frame timing by duplicating frames and playing the whole list at a
 * fixed fps (idle = 92 frames of 3 poses at 30fps), so playback just steps through
 * the frame list at `speed` fps. Non-looping clips hold their final frame and emit
 * `animation_finished` once, exactly like AnimatedSprite2D.
 */

import { AnimationCursor, assertTimedClip } from "../core/AnimationCursor.js";

/** Atlas source rectangle, in pixels (top-left origin). */
export type Region = readonly [x: number, y: number, w: number, h: number];

export interface FrameData {
  /** Region in the normal atlas (x.png). */
  region: Region;
  /** Same pose in the arm-pointing atlas (x_leftarm.png); see scripts/build-anims.mjs. */
  armRegion?: Region;
  /** Godot per-frame duration multiplier (usually 1.0). */
  duration: number;
}

export interface ClipData {
  loop: boolean;
  speed: number; // frames per second
  frames: FrameData[];
}

export interface AnimData {
  animations: Record<string, ClipData>;
}

/** Runtime validation for generated/imported JSON crossing into the engine. */
export function assertAnimData(data: unknown, label = "animation data"): asserts data is AnimData {
  if (!isRecord(data) || !isRecord(data.animations)) {
    throw new Error(`${label}: expected an animations object`);
  }
  if (Object.keys(data.animations).length === 0) {
    throw new Error(`${label}: must contain at least one animation`);
  }
  for (const [name, value] of Object.entries(data.animations)) {
    if (!isRecord(value) || typeof value.loop !== "boolean" || !Array.isArray(value.frames)) {
      throw new Error(`${label}: animation '${name}' is malformed`);
    }
    assertTimedClip(value as unknown as ClipData, `${label}: animation '${name}'`);
    value.frames.forEach((frame, index) => {
      if (!isRecord(frame))
        throw new Error(`${label}: animation '${name}' frame ${index} is malformed`);
      assertRegion(frame.region, `${label}: animation '${name}' frame ${index} region`);
      if (frame.armRegion !== undefined) {
        assertRegion(frame.armRegion, `${label}: animation '${name}' frame ${index} armRegion`);
      }
    });
  }
}

export function assertRegion(value: unknown, label = "region"): asserts value is Region {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((part) => Number.isInteger(part)) ||
    value[0] < 0 ||
    value[1] < 0 ||
    value[2] <= 0 ||
    value[3] <= 0
  ) {
    throw new Error(`${label}: expected non-negative integer coordinates and positive dimensions`);
  }
}

/**
 * Which SpriteFrames resource is on the sprite. Shot.gd swaps the whole resource
 * while the buster is out, keeping the clip name and frame index — that is how X
 * points his cannon in every state instead of having a separate "shoot" clip.
 */
export type AnimationLayer = "normal" | "pointing_cannon";

export class AnimationPlayer {
  private clips = new Map<string, ClipData>();
  private current = "idle";
  private readonly cursor = new AnimationCursor<FrameData>();
  private missingFinished = false;
  private layer: AnimationLayer = "normal";

  /** Fired once when a non-looping clip reaches its last frame (Godot's
   *  `animation_finished`). Set by AbilityUser to re-emit on the event bus. */
  onFinished: ((animation: string) => void) | null = null;

  load(data: AnimData): void {
    assertAnimData(data);
    this.clips = new Map(Object.entries(data.animations));
    // Re-resolve whatever was already playing against the freshly loaded clips.
    this.play(this.current);
  }

  get animation(): string {
    return this.current;
  }
  get frame(): number {
    return this.cursor.frame;
  }
  get animation_layer(): AnimationLayer {
    return this.layer;
  }
  set animation_layer(layer: AnimationLayer) {
    this.layer = layer;
  }

  /** AbilityUser.play_animation — restarts even if the same clip is playing. */
  play(name: string, frame = 0): void {
    this.current = name;
    this.cursor.play(this.clips.get(name) ?? null, frame);
    this.missingFinished = false;
  }

  /** AbilityUser.play_animation_once — no-op if that clip is already playing. */
  play_once(name: string): void {
    if (this.current !== name) this.play(name);
  }

  set_frame(frame: number): void {
    this.cursor.seek(frame);
    this.missingFinished = false;
  }

  /** The frame currently displayed, or null when no clip data is loaded. */
  currentFrame(): FrameData | null {
    return this.cursor.currentFrame;
  }

  /** Atlas region for the current frame, honouring the active layer. */
  currentRegion(): Region | null {
    const frame = this.currentFrame();
    if (!frame) return null;
    if (this.layer === "pointing_cannon" && frame.armRegion) return frame.armRegion;
    return frame.region;
  }

  /** Advance playback by `dt` seconds (driven from the fixed physics tick). */
  advance(dt: number): void {
    const clip = this.clips.get(this.current);
    if (!clip || clip.frames.length === 0) {
      // No clip data (headless): report the clip as finished once, so handoffs
      // like walk_start -> walk and recover -> idle still resolve.
      if (!this.missingFinished) {
        this.missingFinished = true;
        this.onFinished?.(this.current);
      }
      return;
    }
    if (this.cursor.advance(dt)) this.onFinished?.(this.current);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
