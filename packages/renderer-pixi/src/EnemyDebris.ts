import {
  ENEMY_DEBRIS_COUNT,
  ENEMY_DEBRIS_FRAME_COUNT,
  ENEMY_DEBRIS_GRAVITY,
  ENEMY_DEBRIS_LIFETIME,
  ENEMY_DEBRIS_SPEED,
  ENEMY_DEBRIS_SPEED_RANDOM,
  ENEMY_DEBRIS_SPREAD_DEGREES,
} from "@mmx/engine/core/constants.js";

/**
 * The chunks an enemy scatters when it dies — port of the "remains_particles"
 * GPUParticles2D nested under Shared/QuickEnemyDeath.tscn's Remains node (see
 * ENEMY_DEBRIS_* in constants.ts for the numbers this reads).
 *
 * Unlike {@link EnemyExplosion}'s static puffs, RemainsParticle.tres gives
 * these real motion — launched in a cone around straight up and pulled back
 * down by gravity — so each chunk is simulated rather than just aged. And
 * unlike a normal sprite clip, each chunk shows one still icon for its whole
 * flight: the material sets a random per-particle `anim_offset` but no
 * `anim_speed`, so nothing ever advances it past that one frame.
 */

/** One live chunk, in world pixels and velocity. */
export interface DebrisChunk {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Which of the 18 remains icons this chunk holds for its whole flight. */
  frame: number;
  age: number;
}

/** Several deaths landing on the same tick must not grow this without bound. */
const MAX_CHUNKS = ENEMY_DEBRIS_COUNT * 4;

/**
 * The source's remains_particles lifetime is 2.0s, but at up to 400px/s launch
 * and 800px/s^2 gravity a chunk clears the 224px view height in well under a
 * second — the rest of that 2s is spent falling somewhere off-screen the
 * player will never see. Trimmed here so a chunk fades out on-screen instead
 * of lingering past the point it stopped being visible.
 */
const FADE_FRACTION = 0.25; // final quarter of life fades to 0 (Remains' "disabler" fade_out flag).
const SPREAD_RADIANS = (ENEMY_DEBRIS_SPREAD_DEGREES * Math.PI) / 180;

export class EnemyDebris {
  readonly chunks: DebrisChunk[] = [];

  /** Remains.start(): `emitting = true`, explosiveness 1.0 — all four leave at once. */
  spawn(x: number, y: number): void {
    for (let i = 0; i < ENEMY_DEBRIS_COUNT; i++) {
      // direction (0,-1,0), i.e. straight up, spread by the material's cone.
      const angle = -Math.PI / 2 + (Math.random() * 2 - 1) * SPREAD_RADIANS;
      const speed = ENEMY_DEBRIS_SPEED * (1 - ENEMY_DEBRIS_SPEED_RANDOM * Math.random());
      this.chunks.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        frame: Math.floor(Math.random() * ENEMY_DEBRIS_FRAME_COUNT),
        age: 0,
      });
    }
    if (this.chunks.length > MAX_CHUNKS) this.chunks.splice(0, this.chunks.length - MAX_CHUNKS);
  }

  /** Driven off the fixed tick, same as DashSmoke — see its tick() for why. */
  tick(dt: number): void {
    let live = 0;
    for (const c of this.chunks) {
      c.age += dt;
      if (c.age >= ENEMY_DEBRIS_LIFETIME) continue;
      c.vy += ENEMY_DEBRIS_GRAVITY * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      this.chunks[live++] = c;
    }
    this.chunks.length = live;
  }

  /** 1 until the final quarter of life, then eases to 0 — the disabler's fade_out. */
  static alpha(c: DebrisChunk): number {
    const remaining = ENEMY_DEBRIS_LIFETIME - c.age;
    const fadeStart = ENEMY_DEBRIS_LIFETIME * FADE_FRACTION;
    if (remaining >= fadeStart) return 1;
    return Math.max(0, remaining / fadeStart);
  }

  clear(): void {
    this.chunks.length = 0;
  }
}
