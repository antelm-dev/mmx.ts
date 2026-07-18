import { World } from "./World.js";
import { Rng } from "../core/Rng.js";
import {
  BUSTER_SHOTS,
  HIT_FX_FPS,
  HIT_FX_FRAME_COUNT,
  SHOT_FRAME_COUNT,
  type ShotStats,
} from "../core/constants.js";

/**
 * Buster projectile — port of WeaponShot.gd / Lemon.gd / Medium Buster.gd /
 * Charged Buster.gd, which form an inheritance chain rather than three separate
 * things. The differences between them are all data (damage, speed, hitbox, hit
 * effect, spawn offset), so here they are one class driven by BUSTER_SHOTS.
 *
 * The part worth preserving from the original is the *two-phase death*. A shot that
 * connects does not vanish: `hit()` disables the sprite and the damage box but keeps
 * the node alive on a `countdown_to_destruction`, so its hit particle gets to finish
 * playing where the impact happened. Collapsing that into a plain `alive = false`
 * is what makes ported shooting feel dead — the impact never reads on screen.
 *
 * So a projectile moves through: live -> spent (invisible, harmless, particle
 * playing) -> gone. Only the live phase collides.
 */
export type ShotPhase = "live" | "spent";

export class Projectile {
  readonly stats: ShotStats;
  /** Cosmetic playback state; the renderer advances nothing itself. */
  frame = 0;
  /** True once the impact particle has been spawned, so it only ever fires once. */
  emittedHitParticle = false;
  /** Where the hit particle plays — the impact point, not the shot's last position. */
  hitX = 0;
  hitY = 0;
  /** Vertical flip on the hit particle (SpriteEffect vertical_flip_chance = 0.5). */
  hitFlipV = false;

  phase: ShotPhase = "live";
  alive = true;

  private animSec = 0;
  private countdown = 0;

  constructor(
    public x: number,
    public y: number,
    public dir: number,
    /** Charge level as Charge.gd reports it; clamped onto the shots that exist. */
    charge: number,
    /** Defaults to a fresh seeded generator so a shot can be built standalone. */
    rng: Rng = new Rng(),
  ) {
    // Weapon.gd:clamp_to_max_charge — the buster only carries three projectiles.
    const level = Math.max(0, Math.min(charge, BUSTER_SHOTS.length - 1));
    this.stats = BUSTER_SHOTS[level];

    this.x += this.stats.spawnX * dir;
    this.y += this.stats.spawnY;
    if (this.stats.verticalRange > 0) {
      // WeaponShot.position_setup: `int(randf_range(-r, r))`.
      //
      // Worth knowing before "fixing" this: GDScript's int() truncates toward
      // zero, so at the buster's range of 1 every draw in (-1, 1) collapses to 0
      // and the scatter never actually fires. It is dead code in the original.
      // Ported as written — the buster is meant to shoot in a straight line, and
      // rounding instead would introduce a 1px wobble the real game never had.
      // A weapon with a range of 2+ would scatter here as intended.
      const r = this.stats.verticalRange;
      this.y += Math.trunc(rng.range(-r, r));
    }
    if (this.stats.randomStartFrame) {
      // Lemon.references_setup — desync the spin of shots fired back to back.
      this.frame = rng.int(0, SHOT_FRAME_COUNT - 1);
    }
    this.hitFlipV = rng.next() <= 0.5;
  }

  get kind(): string {
    return this.stats.kind;
  }
  get damage(): number {
    return this.stats.damage;
  }
  /** Charge level this shot was fired at, as an index into BUSTER_SHOTS. */
  get charge(): number {
    return BUSTER_SHOTS.indexOf(this.stats);
  }
  get vx(): number {
    return this.stats.speed * this.dir;
  }
  /** Whether this shot can still collide — `can_be_hit` / the damage box. */
  get isLive(): boolean {
    return this.phase === "live";
  }

  /** World-space AABB of the damage box (collisionShape2D + its node offset). */
  get bounds(): { left: number; right: number; top: number; bottom: number } {
    const cx = this.x + this.stats.offsetX * this.dir;
    return {
      left: cx - this.stats.halfW,
      right: cx + this.stats.halfW,
      top: this.y - this.stats.halfH,
      bottom: this.y + this.stats.halfH,
    };
  }

  /**
   * WeaponShot.hit — spend the shot at `atX`/`atY` and start the particle. The
   * impact point matters: a fast charged shot travels ~7px per tick, so playing
   * the burst at the post-step position puts it visibly inside the wall.
   */
  hit(atX = this.x, atY = this.y): void {
    if (this.phase !== "live") return;
    this.phase = "spent";
    this.hitX = atX;
    this.hitY = atY;
    this.emittedHitParticle = true;
    this.countdown = 0.01; // WeaponShot.disable_visual_and_mechanics
    this.animSec = 0; // the particle plays from its first frame, not the shot's
  }

  update(dt: number, world: World): void {
    if (this.phase === "spent") {
      // Still on screen only as a particle; hold position and run out the clock.
      this.countdown += dt;
      this.animSec += dt;
      if (this.countdown > this.stats.timeOutsideScreen) this.alive = false;
      return;
    }

    this.advanceAnimation(dt);

    const dx = this.vx * dt;
    // Cast the whole step instead of sampling only the new position: a fast
    // charged shot would otherwise register its impact several pixels inside the
    // wall (and could skip past thin geometry entirely).
    const wall = world.raycastX(this.x, this.y, dx);
    if (wall !== null) {
      this.x = wall;
      this.hit(wall, this.y);
      return;
    }

    this.x += dx;
    // Leaving the room is not an impact — no particle, the shot just expires.
    if (this.x < 0 || this.x > world.widthPx) this.alive = false;
  }

  /**
   * Current frame of the impact effect, or -1 when nothing should be drawn.
   *
   * The burst and the projectile node have *different* lifetimes and conflating
   * them is what leaves a hit effect frozen on screen. SpriteEffect is one_shot:
   * it destroys itself after 4 frames at 32fps (0.125s). The spent projectile
   * outlives that by design — up to 0.4s for a charged shot — so past the last
   * frame there is simply nothing left to draw.
   */
  get hitParticleFrame(): number {
    if (this.phase !== "spent") return -1;
    const frame = Math.floor(this.animSec * HIT_FX_FPS);
    return frame < HIT_FX_FRAME_COUNT ? frame : -1;
  }

  private advanceAnimation(dt: number): void {
    // All three projectile sheets are uniform-duration loops, so playback is a
    // plain accumulator rather than the per-frame walk AnimationPlayer needs.
    const secPerFrame = this.stats.frameMs / 1000;
    this.animSec += dt;
    while (this.animSec >= secPerFrame) {
      this.animSec -= secPerFrame;
      this.frame = (this.frame + 1) % SHOT_FRAME_COUNT;
    }
  }
}
