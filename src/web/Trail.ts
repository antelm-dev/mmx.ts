import { Region, AnimationLayer } from '../engine/Animation.js';

/**
 * Afterimage trail — the visual half of SpriteEffect.gd.
 *
 * The original spawns ghosts by *duplicating* the sprite node: `emit()` copies the
 * live transform and facing (`scale.x`) into a detached Sprite2D that then lives on
 * its own until `max_duration` elapses (SpriteEffect.gd `emit` / `_physics_process`).
 * Dash.gd drives one of these from `synchronize_sprite_effect()`, which each frame
 * copies `character.animatedSprite.frame` and the facing direction onto the effect —
 * so a ghost is always the pose that was on screen at the instant it was emitted,
 * frozen, not a clip of its own.
 *
 * This is that, minus the scene tree: a ring of frozen snapshots that fade out. It
 * lives in web/ rather than engine/ because nothing in the moveset reads it — unlike
 * AnimationPlayer, which the abilities genuinely branch on.
 *
 * Sampling is driven from the *fixed* tick, not from render(), so the spacing between
 * ghosts is a function of how far the body moved in a physics step and not of the
 * host's refresh rate — a 144Hz machine gets the same trail as a 60Hz one.
 */

/** One frozen copy of the sprite, as it looked at the instant it was emitted. */
export interface Ghost {
  x: number;
  y: number;
  region: Region;
  facing: number;
  layer: AnimationLayer;
  /** Seconds since emission; the ghost is dropped once this passes `life`. */
  age: number;
  life: number;
  /** Peak opacity, before the age fade is applied. */
  alpha: number;
}

/** What the trail copies off the sprite when it emits (SpriteEffect's `duplicate()`). */
export interface GhostSource {
  x: number;
  y: number;
  region: Region;
  facing: number;
  layer: AnimationLayer;
}

/** Per-emitter tuning — the `@export`s on the Godot SpriteEffect node. */
export interface TrailStyle {
  /** Seconds between ghosts. */
  interval: number;
  /** SpriteEffect.max_duration — how long one ghost survives. */
  life: number;
  /** Opacity of a freshly emitted ghost. */
  alpha: number;
}

/**
 * Dash ghosts are dense and short-lived: at dash speed the body clears ~3px per
 * physics frame, so emitting every other frame lays down a continuous streak that
 * has fully faded by the time the dash ends.
 */
export const DASH_TRAIL: TrailStyle = { interval: 1 / 30, life: 0.16, alpha: 0.55 };

/**
 * Wall slide is far slower (WALLSLIDE_SPEED = 90 vs DASH_SPEED = 200) and the body
 * barely moves horizontally, so ghosts stack on top of each other. Emitting a third
 * as often and holding them longer reads as a vertical smear down the wall instead
 * of a solid second sprite. (The original uses a smoke particle here rather than an
 * afterimage — this keeps one effect for both, per the request.)
 */
export const WALLSLIDE_TRAIL: TrailStyle = { interval: 1 / 15, life: 0.26, alpha: 0.32 };

/** Hard cap on live ghosts, so a pathological frame can't grow the buffer unbounded. */
const MAX_GHOSTS = 32;

export class Trail {
  readonly ghosts: Ghost[] = [];
  private sinceEmit = 0;

  /**
   * Advance one fixed step. Pass the sprite snapshot to emit from, or null when
   * nothing is emitting — the existing ghosts still age out, so a trail that stops
   * mid-dash dissolves rather than vanishing (SpriteEffect.stop_emission leaves the
   * already-spawned particles alive).
   */
  sample(dt: number, source: GhostSource | null, style: TrailStyle): void {
    // Each ghost carries the life of the style that emitted it, so a dash that flows
    // straight into a wall slide has two lifetimes in flight at once and the expired
    // ones are not necessarily the oldest — every ghost is tested, not just a prefix.
    let live = 0;
    for (const g of this.ghosts) {
      g.age += dt;
      if (g.age < g.life) this.ghosts[live++] = g;
    }
    this.ghosts.length = live;

    if (!source) {
      // Leave sinceEmit primed so the next dash emits on its very first frame
      // rather than after a hole the length of one interval.
      this.sinceEmit = style.interval;
      return;
    }

    this.sinceEmit += dt;
    if (this.sinceEmit < style.interval) return;
    this.sinceEmit = 0;

    this.ghosts.push({
      x: source.x,
      y: source.y,
      region: source.region,
      facing: source.facing,
      layer: source.layer,
      age: 0,
      life: style.life,
      alpha: style.alpha,
    });
    if (this.ghosts.length > MAX_GHOSTS) this.ghosts.shift();
  }

  /** Opacity of a ghost right now: its peak, faded linearly to nothing over its life. */
  static opacity(g: Ghost): number {
    return g.alpha * Math.max(0, 1 - g.age / g.life);
  }

  clear(): void {
    this.ghosts.length = 0;
  }
}
