import { World } from "./World.js";
import { Rng } from "../core/Rng.js";
import { AnimationCursor, uniformClip, type TimedClip } from "../core/AnimationCursor.js";
import {
  HIT_FX_FPS,
  HIT_FX_FRAME_COUNT,
  SHOT_FRAME_COUNT,
  WEAPON_SHOTS,
  type ShotStats,
  type WeaponId,
} from "../core/constants.js";

/**
 * Any weapon's projectile — port of WeaponShot.gd / Lemon.gd / Medium Buster.gd /
 * Charged Buster.gd (an inheritance chain in the original) plus DarkArrow.gd.
 * The differences between them are all data (damage, speed, hitbox, hit effect,
 * spawn offset), so here they are one class driven by {@link WEAPON_SHOTS}.
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

/** One spin-loop clip per shot, per weapon — {@link WEAPON_SHOTS} indexed the same way. */
const SHOT_ANIMATIONS = Object.fromEntries(
  (Object.entries(WEAPON_SHOTS) as [WeaponId, readonly ShotStats[]][]).map(([weapon, shots]) => [
    weapon,
    shots.map((stats) => uniformClip(stats.frameCount ?? SHOT_FRAME_COUNT, 1000 / stats.frameMs, true)),
  ]),
) as Record<WeaponId, TimedClip[]>;
const HIT_ANIMATION = uniformClip(HIT_FX_FRAME_COUNT, HIT_FX_FPS, false);

export class Projectile {
  readonly weapon: WeaponId;
  readonly stats: ShotStats;
  private readonly shotAnimation = new AnimationCursor();
  private readonly hitAnimation = new AnimationCursor();
  /** True once the impact particle has been spawned, so it only ever fires once. */
  emittedHitParticle = false;
  /** Where the hit particle plays — the impact point, not the shot's last position. */
  hitX = 0;
  hitY = 0;
  /** Vertical flip on the hit particle (SpriteEffect vertical_flip_chance = 0.5). */
  hitFlipV = false;

  phase: ShotPhase = "live";
  alive = true;

  private countdown = 0;

  constructor(
    public x: number,
    public y: number,
    public dir: number,
    /** Charge level as Charge.gd reports it; clamped onto the shots that exist. */
    charge: number,
    /** Defaults to a fresh seeded generator so a shot can be built standalone. */
    rng: Rng = new Rng(),
    /** Which weapon fired this shot — see {@link WEAPON_SHOTS}. Defaults to the buster. */
    weapon: WeaponId = "buster",
  ) {
    // Weapon.gd:clamp_to_max_charge — a weapon's `shots` array clamps the charge
    // level onto whatever projectiles it actually has (the buster carries three;
    // Dark Arrow, ported without its charged tier, carries only one).
    const shots = WEAPON_SHOTS[weapon];
    const level = Math.max(0, Math.min(charge, shots.length - 1));
    this.weapon = weapon;
    this.stats = shots[level];
    this.shotAnimation.play(SHOT_ANIMATIONS[weapon][level]);
    this.hitAnimation.play(HIT_ANIMATION);

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
      this.shotAnimation.seek(rng.int(0, SHOT_FRAME_COUNT - 1));
    }
    this.hitFlipV = rng.next() <= 0.5;
  }

  get kind(): string {
    return this.stats.kind;
  }
  get damage(): number {
    return this.stats.damage;
  }
  /** Charge level this shot was fired at, as an index into its weapon's shot table. */
  get charge(): number {
    return WEAPON_SHOTS[this.weapon].indexOf(this.stats);
  }
  get vx(): number {
    return this.stats.speed * this.dir;
  }
  /** Cosmetic playback state; the renderer advances nothing itself. */
  get frame(): number {
    return this.shotAnimation.frame;
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
    this.hitAnimation.seek(0); // the particle plays from its first frame, not the shot's
  }

  update(dt: number, world: World): void {
    if (this.phase === "spent") {
      // Still on screen only as a particle; hold position and run out the clock.
      this.countdown += dt;
      this.hitAnimation.advance(dt);
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
    return this.hitAnimation.finished ? -1 : this.hitAnimation.frame;
  }

  private advanceAnimation(dt: number): void {
    this.shotAnimation.advance(dt);
  }
}
