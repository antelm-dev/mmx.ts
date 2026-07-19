import {
  ENEMY_EXPLOSION_FRAME_COUNT,
  ENEMY_EXPLOSION_PUFF_COUNT,
  ENEMY_EXPLOSION_RADIUS,
} from "@mmx/engine/core/constants.js";
import { AnimationCursor, uniformClip } from "@mmx/engine/core/AnimationCursor.js";

/**
 * The burst an enemy leaves behind when it dies — port of the "Explosion
 * Particles" GPUParticles2D on Shared/QuickEnemyDeath.tscn (see
 * ENEMY_EXPLOSION_* in constants.ts for the numbers this reads).
 *
 * Unlike {@link DashSmoke}'s single puff, ExplosionParticles.tres gives every
 * particle direction (0,0,0) and no gravity — each one is simply scattered
 * within the emission sphere on spawn and never moves again, playing the sheet
 * once in place. So a "burst" here is exactly that: several static puffs
 * spawned together from one call, each running its own independent clip.
 */

/** One live puff, in world pixels — fixed for its whole life, unlike debris. */
export interface ExplosionPuff {
  x: number;
  y: number;
  animation: AnimationCursor;
}

/** Several deaths landing on the same tick must not grow this without bound. */
const MAX_PUFFS = ENEMY_EXPLOSION_PUFF_COUNT * 4;
const EXPLOSION_FPS = 24; // build-shots.mjs picks the same rate for the sheet's own clip.
const EXPLOSION_ANIMATION = uniformClip(ENEMY_EXPLOSION_FRAME_COUNT, EXPLOSION_FPS, false);

export class EnemyExplosion {
  readonly puffs: ExplosionPuff[] = [];

  /** EnemyDeath._Setup: `explosions.emitting = true`, scattered across the sphere. */
  spawn(x: number, y: number): void {
    for (let i = 0; i < ENEMY_EXPLOSION_PUFF_COUNT; i++) {
      // emission_shape = sphere, sampled uniformly over the disc's area rather
      // than its radius — otherwise puffs would visibly clump toward the centre.
      const angle = Math.random() * Math.PI * 2;
      const r = ENEMY_EXPLOSION_RADIUS * Math.sqrt(Math.random());
      const animation = new AnimationCursor();
      animation.play(EXPLOSION_ANIMATION);
      this.puffs.push({ x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r, animation });
    }
    if (this.puffs.length > MAX_PUFFS) this.puffs.splice(0, this.puffs.length - MAX_PUFFS);
  }

  /** Driven off the fixed tick, same as DashSmoke — see its tick() for why. */
  tick(dt: number): void {
    let live = 0;
    for (const p of this.puffs) {
      p.animation.advance(dt);
      if (!p.animation.finished) this.puffs[live++] = p;
    }
    this.puffs.length = live;
  }

  static frame(p: ExplosionPuff): number {
    return p.animation.frame;
  }

  clear(): void {
    this.puffs.length = 0;
  }
}
