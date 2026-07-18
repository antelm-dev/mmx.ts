/**
 * Plays the player's animations exactly as the original Godot project does. The
 * data (x_anims.json) is exported straight from the game's SpriteFrames resource
 * (x.res): each clip is a flat list of frame regions plus the clip's `speed` (fps)
 * and `loop` flag.
 *
 * Godot bakes per-frame timing by *duplicating* frames and playing the whole list
 * at a fixed fps (e.g. idle = 92 frames of 3 poses at 30fps), so we simply step
 * through the frame list at `speed` fps. Only idle/walk/talk/crouch_talk/weak loop;
 * every other clip plays once and holds its final frame (matching x.res).
 *
 * This is renderer-agnostic: it just tracks which atlas region is current, and the
 * caller blits that region with the Canvas 2D `drawImage` source-rect overload.
 */

interface FrameData {
  region: [number, number, number, number]; // x, y, w, h in the atlas
  duration: number; // relative multiplier (Godot per-frame duration; usually 1.0)
}
interface ClipData {
  loop: boolean;
  speed: number; // frames per second
  frames: FrameData[];
}
export interface AnimData {
  animations: Record<string, ClipData>;
}

/** Current atlas source rectangle, in pixels (top-left origin). */
export type Region = readonly [x: number, y: number, w: number, h: number];

export class SpriteAnimator {
  private readonly clips = new Map<string, ClipData>();
  private current = '';
  private frameIdx = 0;
  private accMs = 0;
  private pendingNext: string | null = null;

  /** Clips that play a short intro clip first when newly requested. */
  private readonly introOf: Record<string, string> = { walk: 'walk_start' };

  constructor(data: AnimData) {
    for (const [name, clip] of Object.entries(data.animations)) {
      this.clips.set(name, clip);
    }
  }

  get clipNames(): string[] {
    return [...this.clips.keys()];
  }

  /** The atlas region for the frame currently being displayed. */
  currentRegion(): Region {
    const clip = this.clips.get(this.current);
    if (!clip) return [0, 0, 0, 0];
    return clip.frames[this.frameIdx].region;
  }

  /** Request a clip. Handles intro clips (e.g. walk_start -> walk) and no-ops if
   *  the requested clip (or its intro) is already playing. */
  play(name: string): void {
    if (!this.clips.has(name)) return;
    if (name === this.current) return;
    // Already running this clip's intro on the way to it: let it finish.
    if (this.pendingNext === name && this.current === this.introOf[name]) return;

    const intro = this.introOf[name];
    if (intro && this.clips.has(intro) && this.current !== intro) {
      this.start(intro);
      this.pendingNext = name;
    } else {
      this.start(name);
      this.pendingNext = null;
    }
  }

  private start(name: string): void {
    this.current = name;
    this.frameIdx = 0;
    this.accMs = 0;
  }

  /** Advance the current clip by real elapsed wall-clock time (ms). */
  update(dtMs: number): void {
    const clip = this.clips.get(this.current);
    if (!clip) return;
    this.accMs += dtMs;
    let msPerFrame = (1000 * clip.frames[this.frameIdx].duration) / clip.speed;
    while (this.accMs >= msPerFrame) {
      this.accMs -= msPerFrame;
      if (this.frameIdx < clip.frames.length - 1) {
        this.frameIdx++;
      } else if (this.pendingNext) {
        this.start(this.pendingNext);
        this.pendingNext = null;
        return;
      } else if (clip.loop) {
        this.frameIdx = 0;
      } else {
        this.accMs = 0; // hold on the last frame
        break;
      }
      msPerFrame = (1000 * this.clips.get(this.current)!.frames[this.frameIdx].duration) / clip.speed;
    }
  }
}
