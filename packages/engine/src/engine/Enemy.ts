import { AbilityUser } from "./AbilityUser.js";
import { Actor } from "./Actor.js";
import { World } from "./World.js";
import { Rng } from "../core/Rng.js";
import { EnemyAI } from "./EnemyAI.js";
import type { EnemyAbility } from "./enemy/EnemyAbility.js";
import { ENEMY_FLASH_TIME, ENEMY_STATS, type EnemyStats } from "../core/constants.js";

export type EnemyKind = "metool" | "bat";

/**
 * Enemy actor — port of Enemy.gd plus the per-enemy modules its scenes hang off
 * it (EnemyShield, EnemyDamage, EnemyDeath, DamageOnTouch).
 *
 * Those are separate Nodes in Godot because a scene tree is how that engine
 * composes behaviour; here they are fields and methods, because the only thing
 * the composition bought was editor-time configuration and that has moved into
 * ENEMY_STATS. What is preserved is the *signal flow*, since the AI is wired to
 * it: taking a hit, breaking a guard and reaching zero health each notify the AI,
 * which is what turns a broken guard into a stun instead of the ability polling
 * for it.
 *
 * Enemies deliberately do NOT use AbilityUser's priority-based locomotion race.
 * The player picks his own state from input every frame; an enemy's state is
 * chosen by {@link EnemyAI} from the event lists its scene declared, and the
 * abilities arbitrate between themselves with Godot's conflicting_moves rules.
 */
export class Enemy extends AbilityUser {
  readonly stats: EnemyStats;
  readonly ai: EnemyAI;
  readonly rng: Rng;

  /** The player, while inside the vision box; null otherwise (AI.gd `target`). */
  target: Actor | null = null;

  /**
   * EnemyShield.active. While up, the shield eats shots from the front and the
   * body cannot be damaged at all (Metool.tscn: Damage.ignore_hits_if_shield).
   */
  shield_active = false;
  /** EnemyShield.breakable — a charged shot breaks the guard rather than bouncing. */
  shield_breakable = true;

  /** Set once zero health is reached, so the death handoff only fires once. */
  private emitted_zero_health = false;
  /** Cleared by Death once the corpse has been reaped; the stage then drops it. */
  alive = true;
  /** True while the death explosion is emitting (EnemyDeath `explosions.emitting`). */
  exploding = false;
  /** EnemyDeath hides the sprite once the blast is over. */
  sprite_visible = true;
  /**
   * Counts down the white damage flash (EnemyDamage.play_shader sets the sprite
   * material's Flash parameter, cleared after max_flash_time = 0.035s). It is the
   * only feedback that a hit registered on an enemy that survives it.
   */
  flash = 0;

  constructor(
    readonly kind: EnemyKind,
    world: World,
    x: number,
    y: number,
    facing = -1,
    seed?: number,
  ) {
    super(world, x, y);
    this.stats = ENEMY_STATS[kind];
    this.rng = new Rng(seed);
    this.ai = new EnemyAI(this);

    this.hw = this.stats.hw;
    this.hh = this.stats.hh;
    this.max_health = this.stats.max_health;
    this.current_health = this.stats.max_health;

    // Enemy.gd:set_direction_on_ready — spawn facing the scene's spawn_direction.
    this.set_direction(facing);
    this.update_facing_direction();
  }

  /** Enemy abilities, narrowed from the moveset AbilityUser stores them in. */
  get abilities(): EnemyAbility[] {
    return this.moveset as EnemyAbility[];
  }

  // ---------------------------------------------------------------------------
  // Vision (AI/vision Area2D)
  // ---------------------------------------------------------------------------

  /**
   * Is `who` inside the vision box? The box is centred on the enemy and is not
   * mirrored by facing: AI.handle_direction flips `vision.scale.x`, but every
   * vision shape in these scenes is symmetric about x, so the flip is a no-op —
   * a Metool notices the player behind it exactly as readily as in front, and
   * Hide.gd is what makes it wait until the player looks away.
   */
  canSee(who: Actor): boolean {
    const s = this.stats;
    return (
      Math.abs(who.pos.x - this.pos.x) <= s.vision_hw &&
      Math.abs(who.pos.y - (this.pos.y + s.vision_oy)) <= s.vision_hh
    );
  }

  /** World-space hurtbox (area2D) — what player projectiles are tested against. */
  get hurtbox(): { left: number; right: number; top: number; bottom: number } {
    const s = this.stats;
    return {
      left: this.pos.x - s.hurt_hw,
      right: this.pos.x + s.hurt_hw,
      top: this.pos.y - s.hurt_hh,
      bottom: this.pos.y + s.hurt_hh,
    };
  }

  // ---------------------------------------------------------------------------
  // Shield (EnemyShield.gd)
  // ---------------------------------------------------------------------------

  has_shield(): boolean {
    return this.shield_active;
  }
  activate_shield(): void {
    this.shield_active = true;
  }
  deactivate_shield(): void {
    this.shield_active = false;
  }

  /**
   * EnemyShield.react / handle_break_guard — a shot that lands on a raised
   * shield is consumed either way; whether the guard survives depends on the
   * shot, not on the enemy. `break_guards` is a property of the projectile in
   * the original, and only the charged buster carries it.
   *
   * Returns true when the guard broke, which the AI turns into a stun.
   */
  hit_shield(breaks_guard: boolean): boolean {
    if (breaks_guard && this.shield_breakable) {
      this.deactivate_shield();
      this.events.emit("guard_break");
      return true;
    }
    this.events.emit("shield_hit");
    return false;
  }

  // ---------------------------------------------------------------------------
  // Damage (EnemyDamage.gd)
  // ---------------------------------------------------------------------------

  /**
   * EnemyDamage.should_ignore_damage, for the cases these two scenes configure.
   *
   * The Metool sets `ignore_hits_if_shield`, so while its helmet is down the
   * body simply cannot be hurt — the shot has to be spent on the shield instead.
   * That is the entire fight: you either wait for it to open, or you break the
   * guard with a charged shot.
   */
  can_be_damaged(): boolean {
    if (!this.has_health() || this.is_invulnerable()) return false;
    return !this.has_shield();
  }

  /**
   * EnemyDamage.damage — reduce health and fire the signal the AI listens on.
   * Deliberately overrides Actor.damage, which has no notion of a shield or of
   * the zero-health handoff.
   */
  override damage(value: number): void {
    if (!this.can_be_damaged()) return;
    this.current_health -= value;
    this.flash = ENEMY_FLASH_TIME;
    this.events.emit("damage", value);
    if (this.current_health <= 0) {
      this.emit_zero_health();
    } else {
      this.events.emit("got_hit");
    }
  }

  /** Enemy.gd:emit_zero_health_signal — fires once, then the AI runs on_death. */
  private emit_zero_health(): void {
    if (this.emitted_zero_health) return;
    this.emitted_zero_health = true;
    this.current_health = 0;
    this.interrupt_all_moves();
    this.events.emit("zero_health");
  }

  /** Enemy.gd:interrupt_all_moves. */
  interrupt_all_moves(): void {
    for (const move of [...this.executing_moves]) move.EndAbility();
  }

  /**
   * Enemy.gd:is_colliding_with_wall(distance, vertical_correction) — a pair of
   * rays cast sideways from the body centre, rather than Actor's full-height
   * wall probe. Patrol turns on this, and the distance it passes is wider than
   * the body, so a patroller turns *before* it is flush against the wall.
   */
  wall_ahead(distance = 8, vertical_correction = 8): number {
    const y = this.pos.y + vertical_correction;
    if (this.world.raycastX(this.pos.x, y, distance) !== null) return 1;
    if (this.world.raycastX(this.pos.x, y, -distance) !== null) return -1;
    return 0;
  }

  /** Is there ground within `probe` px below the feet, `ahead` px forward? */
  ground_ahead(ahead: number, probe = 4): boolean {
    const x = this.pos.x + ahead * this.get_facing_direction();
    return this.world.isSolidAt(x, this.pos.y + this.hh + probe);
  }

  // ---------------------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------------------

  /**
   * Mirrors the player's tick order — decide, integrate, then draw — with the AI
   * standing in for input. Fliers skip terrain integration entirely: their scene
   * has `collision_mask = 0`, so a bat passes through walls and its velocity is
   * applied straight to the position.
   */
  tick(dt: number): void {
    if (this.invulnerability > 0) this.invulnerability -= dt;
    if (this.flash > 0) this.flash -= dt;
    this.clockMs += dt * 1000;

    this.ai.step(dt);
    this.processMoves(dt);

    if (this.stats.flying) {
      this.pos.x += (this.velocity.x + this.bonus_velocity.x) * dt;
      this.pos.y += (this.velocity.y + this.bonus_velocity.y) * dt;
      this.update_facing_direction();
    } else {
      this.physicsStep(dt);
    }

    this.stepAnimation(dt);
  }
}
