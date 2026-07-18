import { DASH_FX_FPS, DASH_FX_FRAME_COUNT } from '../core/constants.js';

/**
 * The dust X kicks up when he pushes off into a dash — the other half of
 * SpriteEffect.gd (see {@link Trail} for the afterimage half).
 *
 * The distinction that shapes this file is where the copy is *parented*. Dash.gd's
 * `duringImage` ghost stays a child of the player and tracks him; `dash_particle`
 * calls `SpriteEffect.emit()`, which does `get_tree().current_scene.add_child(...)`
 * after baking the emitter's `global_transform` into the copy. So the puff is cut
 * loose at the instant of the kick-off: it holds the ground X launched from while he
 * accelerates away, which is what makes the dash read as pushing against something.
 *
 * That means the position is captured once, on spawn, and never recomputed — a puff
 * does not know about the player at all after the frame that emitted it.
 *
 * `one_shot` in the scene means the node is freed once the clip runs out rather than
 * looping, so a puff's whole life is FRAME_COUNT / FPS seconds and there is no fade:
 * the sheet's last frames are already the dust thinning out.
 *
 * Like {@link Trail}, this lives in web/ rather than engine/ because it is purely
 * something to look at — no ability branches on whether a puff exists.
 */

/** One live puff, in world pixels. */
export interface Puff {
  x: number;
  y: number;
  /** Clip to draw, e.g. 'dash' — the sheet on the emitting ability's particle node. */
  clip: string;
  /** Horizontal mirror, from the dash direction (SpriteEffect's `scale.x`). */
  facing: number;
  /** Seconds since emission; drives the frame and decides when the puff is dropped. */
  age: number;
}

/**
 * Hard cap on live puffs. One dash emits exactly one, and a puff outlives its dash by
 * nothing like enough to stack deep — this only exists so a pathological frame cannot
 * grow the array without bound.
 */
const MAX_PUFFS = 8;

export class DashSmoke {
  readonly puffs: Puff[] = [];

  /** SpriteEffect.emit(): a copy pinned to where the emitter stood right now. */
  spawn(x: number, y: number, clip: string, facing: number): void {
    this.puffs.push({ x, y, clip, facing, age: 0 });
    if (this.puffs.length > MAX_PUFFS) this.puffs.shift();
  }

  /**
   * Advance one fixed step, dropping puffs whose clip has run out.
   *
   * Driven off the fixed tick rather than render(), for the same reason the trail is:
   * SpriteEffect ages in `_physics_process`, so the puff must reach a given frame after
   * a fixed number of simulation steps and not after a given amount of wall clock.
   */
  tick(dt: number): void {
    let live = 0;
    for (const p of this.puffs) {
      p.age += dt;
      if (DashSmoke.frame(p) < DASH_FX_FRAME_COUNT) this.puffs[live++] = p;
    }
    this.puffs.length = live;
  }

  /**
   * Which frame of the clip a puff is showing — SpriteEffect.process_frames, which
   * accumulates `delta * animation_speed` and floors it. Past the last frame the
   * one_shot node destroys itself, so callers treat an out-of-range result as dead
   * rather than clamping to the final frame.
   */
  static frame(p: Puff): number {
    return Math.floor(p.age * DASH_FX_FPS);
  }

  clear(): void {
    this.puffs.length = 0;
  }
}
