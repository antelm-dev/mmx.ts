import { EnemyAbility } from './EnemyAbility.js';
import { Vec2 } from '../../core/Vec2.js';
import type { Enemy } from '../Enemy.js';

/**
 * Idle drift around an anchor — port of BeePatrol.gd, which the bat's scene
 * reuses for its BatPatrol node (`area = 16`).
 *
 * The original animates `character.global_position` with a Tween rather than
 * setting a velocity, so the bat eases to a random nearby point and stops dead
 * instead of coasting. Reproduced here as an explicit eased interpolation off the
 * fixed tick: a real tween would advance on the frame clock and make the drift
 * frame-rate dependent, which for the one enemy that moves by position rather
 * than velocity would be visible.
 */
export class Hover extends EnemyAbility {
  readonly name = 'Hover';

  /** BeePatrol exports, as set on SmallBat.tscn. */
  area = 16;
  travel_time = 0.5;
  rest_duration = 0.5;

  /** The point the wandering is centred on; re-anchored after each recoil. */
  private anchor = new Vec2(0, 0);
  private from = new Vec2(0, 0);
  private to = new Vec2(0, 0);
  private rest_time = 0.5;

  constructor(enemy: Enemy) {
    super(enemy);
    this.animation = 'idle';
    this.conflicts = ['Pursuit'];
    this.anchor.set(enemy.pos.x, enemy.pos.y);
  }

  /** BeePatrol.update_patrol_position, wired to BatJump's `ability_end`. */
  reanchor(): void {
    this.anchor.set(this.character.pos.x, this.character.pos.y);
  }

  override _Setup(): void {
    this.from.set(this.character.pos.x, this.character.pos.y);
    this.to.set(this.anchor.x + this.randomOffset(), this.anchor.y + this.randomOffset());
    this.set_direction(this.to.x > this.character.pos.x ? 1 : -1);
    this.rest_time = this.rest_duration + this.character.rng.next();
    // The drift is positional, so no velocity may be left over to add to it.
    this.character.stop_all_movement();
  }

  override _Update(_dt: number): void {
    if (this.attack_stage === 0) {
      const t = Math.min(1, this.timer / this.travel_time);
      const e = easeInOutQuad(t);
      this.character.pos.set(
        this.from.x + (this.to.x - this.from.x) * e,
        this.from.y + (this.to.y - this.from.y) * e,
      );
      if (this.timer > this.travel_time) {
        this.play_animation('idle');
        this.next_attack_stage();
      }
    }
  }

  /**
   * BeePatrol._EndCondition. `timer` resets at the stage hop, so this is the
   * rest measured from the end of the drift, and the AI restarts the ability on
   * the next idle frame — the bat bobs around its anchor indefinitely.
   */
  override _EndCondition(): boolean {
    return this.attack_stage === 1 && this.timer > this.rest_time;
  }

  /**
   * BeePatrol.random_value: `randi() % area*2 + -area`. GDScript binds `%` and
   * `*` left-to-right, so this is `((randi() % area) * 2) - area` — an *even*
   * offset in [-area, area), never the full range the name suggests. Ported as
   * written; the visible behaviour is the intended aimless bobbing either way.
   */
  private randomOffset(): number {
    return (this.character.rng.int(0, this.area - 1) % this.area) * 2 - this.area;
  }
}

/** Godot's Tween.TRANS_QUAD with the default EASE_IN_OUT. */
function easeInOutQuad(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) * (-2 * t + 2)) / 2;
}
