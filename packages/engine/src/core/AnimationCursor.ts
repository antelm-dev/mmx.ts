/** A frame whose duration is expressed as a multiplier of the clip rate. */
export interface TimedFrame {
  duration: number;
}

/** Renderer-independent playback data. Frames may carry any additional metadata. */
export interface TimedClip<TFrame extends TimedFrame = TimedFrame> {
  loop: boolean;
  speed: number;
  frames: readonly TFrame[];
}

export type PlaybackMode = "clip" | "loop" | "once";

// Decimal frame durations such as 0.1 cannot be represented exactly as binary
// floats. Treat sub-picosecond residue as zero so exact authored boundaries do
// not occasionally take one extra simulation tick.
const TIME_EPSILON = 1e-12;

/**
 * Deterministic animation playback driven by the caller's fixed simulation step.
 * It deliberately knows nothing about sprites, atlases, actors, or effects.
 */
export class AnimationCursor<TFrame extends TimedFrame = TimedFrame> {
  private clip: TimedClip<TFrame> | null = null;
  private mode: PlaybackMode = "clip";
  private elapsed = 0;
  private frameIndex = 0;
  private complete = false;

  play(clip: TimedClip<TFrame> | null, frame = 0, mode: PlaybackMode = "clip"): void {
    this.clip = clip;
    this.mode = mode;
    this.elapsed = 0;
    this.complete = false;
    this.frameIndex = clampFrame(frame, clip?.frames.length ?? 0);
  }

  /** Restart the current clip at a particular frame. */
  seek(frame: number): void {
    this.frameIndex = clampFrame(frame, this.clip?.frames.length ?? 0);
    this.elapsed = 0;
    this.complete = false;
  }

  get frame(): number {
    return this.frameIndex;
  }

  get currentFrame(): TFrame | null {
    return this.clip?.frames[this.frameIndex] ?? null;
  }

  get finished(): boolean {
    return this.complete;
  }

  /**
   * Advance playback and return true only on the step that completes a one-shot.
   * A completed one-shot holds its final frame until another clip is played.
   */
  advance(dt: number): boolean {
    if (!this.clip || this.clip.frames.length === 0 || this.complete) return false;
    if (!Number.isFinite(dt) || dt <= 0) return false;

    this.elapsed += dt;
    let frameSeconds = this.currentFrame!.duration / this.clip.speed;
    while (this.elapsed + TIME_EPSILON >= frameSeconds) {
      this.elapsed = Math.max(0, this.elapsed - frameSeconds);
      if (this.frameIndex < this.clip.frames.length - 1) {
        this.frameIndex++;
      } else if (this.shouldLoop()) {
        this.frameIndex = 0;
      } else {
        this.elapsed = 0;
        this.complete = true;
        return true;
      }
      frameSeconds = this.currentFrame!.duration / this.clip.speed;
    }
    return false;
  }

  private shouldLoop(): boolean {
    if (this.mode === "loop") return true;
    if (this.mode === "once") return false;
    return this.clip?.loop ?? false;
  }
}

/** Construct a uniform-duration clip for grid-based effects. */
export function uniformClip(frameCount: number, speed: number, loop: boolean): TimedClip {
  if (!Number.isInteger(frameCount) || frameCount <= 0) {
    throw new Error(`animation frameCount must be a positive integer; got ${frameCount}`);
  }
  const clip = { loop, speed, frames: Array.from({ length: frameCount }, () => ({ duration: 1 })) };
  assertTimedClip(clip);
  return clip;
}

/** Fail early on malformed generated animation data instead of hanging playback. */
export function assertTimedClip(clip: TimedClip, label = "animation clip"): void {
  if (typeof clip.loop !== "boolean") {
    throw new TypeError(`${label}: loop must be a boolean`);
  }
  if (!Number.isFinite(clip.speed) || clip.speed <= 0) {
    throw new Error(`${label}: speed must be greater than zero`);
  }
  if (!Array.isArray(clip.frames) || clip.frames.length === 0) {
    throw new Error(`${label}: must contain at least one frame`);
  }
  clip.frames.forEach((frame, index) => {
    if (!Number.isFinite(frame.duration) || frame.duration <= 0) {
      throw new Error(`${label}: frame ${index} duration must be greater than zero`);
    }
  });
}

function clampFrame(frame: number, frameCount: number): number {
  if (frameCount <= 0) return 0;
  const integer = Number.isFinite(frame) ? Math.trunc(frame) : 0;
  return Math.max(0, Math.min(integer, frameCount - 1));
}
