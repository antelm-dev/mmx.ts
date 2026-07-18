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

/** Atlas source rectangle, in pixels (top-left origin). */
export type Region = readonly [x: number, y: number, w: number, h: number];

export interface FrameData {
  /** Region in the normal atlas (x.png). */
  region: Region;
  /** Same pose in the arm-pointing atlas (x_leftarm.png); see tools/build-anims.mjs. */
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

/**
 * Which SpriteFrames resource is on the sprite. Shot.gd swaps the whole resource
 * while the buster is out, keeping the clip name and frame index — that is how X
 * points his cannon in every state instead of having a separate "shoot" clip.
 */
export type AnimationLayer = 'normal' | 'pointing_cannon';

export class AnimationPlayer {
  private clips = new Map<string, ClipData>();
  private current = 'idle';
  private frameIdx = 0;
  private accSec = 0;
  private finished = false;
  private layer: AnimationLayer = 'normal';

  /** Fired once when a non-looping clip reaches its last frame (Godot's
   *  `animation_finished`). Set by AbilityUser to re-emit on the event bus. */
  onFinished: ((animation: string) => void) | null = null;

  load(data: AnimData): void {
    this.clips = new Map(Object.entries(data.animations));
    // Re-resolve whatever was already playing against the freshly loaded clips.
    this.play(this.current);
  }

  get animation(): string {
    return this.current;
  }
  get frame(): number {
    return this.frameIdx;
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
    this.set_frame(frame);
    this.accSec = 0;
    this.finished = false;
  }

  /** AbilityUser.play_animation_once — no-op if that clip is already playing. */
  play_once(name: string): void {
    if (this.current !== name) this.play(name);
  }

  set_frame(frame: number): void {
    const clip = this.clips.get(this.current);
    const last = clip ? clip.frames.length - 1 : 0;
    this.frameIdx = Math.max(0, Math.min(frame, last));
    this.accSec = 0;
  }

  /** The frame currently displayed, or null when no clip data is loaded. */
  currentFrame(): FrameData | null {
    const clip = this.clips.get(this.current);
    return clip ? (clip.frames[this.frameIdx] ?? null) : null;
  }

  /** Atlas region for the current frame, honouring the active layer. */
  currentRegion(): Region | null {
    const frame = this.currentFrame();
    if (!frame) return null;
    if (this.layer === 'pointing_cannon' && frame.armRegion) return frame.armRegion;
    return frame.region;
  }

  /** Advance playback by `dt` seconds (driven from the fixed physics tick). */
  advance(dt: number): void {
    const clip = this.clips.get(this.current);
    if (!clip || clip.frames.length === 0) {
      // No clip data (headless): report the clip as finished once, so handoffs
      // like walk_start -> walk and recover -> idle still resolve.
      this.emitFinished();
      return;
    }
    if (this.finished) return; // holding the last frame of a one-shot clip

    this.accSec += dt;
    let secPerFrame = clip.frames[this.frameIdx].duration / clip.speed;
    while (this.accSec >= secPerFrame) {
      this.accSec -= secPerFrame;
      if (this.frameIdx < clip.frames.length - 1) {
        this.frameIdx++;
      } else if (clip.loop) {
        this.frameIdx = 0;
      } else {
        this.accSec = 0;
        this.emitFinished();
        break;
      }
      secPerFrame = clip.frames[this.frameIdx].duration / clip.speed;
    }
  }

  private emitFinished(): void {
    if (this.finished) return;
    this.finished = true;
    this.onFinished?.(this.current);
  }
}
