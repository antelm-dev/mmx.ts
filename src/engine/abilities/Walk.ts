import { Movement } from "../ability/Movement.js";
import type { Character } from "../Character.js";

/**
 * Port of Walk.gd — grounded locomotion with a short slow-start from Idle.
 *
 * Starting from a standstill also plays the two-frame `walk_start` lead-in, which
 * hands off to the looping `walk` clip on `animation_finished`. Walking out of any
 * other state (landing, ending a dash) skips it and joins the loop directly.
 */
export class Walk extends Movement {
  readonly name = "Walk";
  priority = 1;
  override animation = "walk"; // Player.tscn
  private minimum_time = 0.02;
  private starting_from_stop = false;

  constructor(character: Character) {
    super(character);
    character.events.on("animation_finished", () => this.onAnimationFinished());
  }

  override should_execute_on_hold(): boolean {
    return true;
  }

  override _StartCondition(): boolean {
    const c = this.character;
    if (!c.is_on_floor()) return false;
    if (
      c.is_colliding_with_wall() !== 0 &&
      c.is_colliding_with_wall_except_feet() === this.get_pressed_direction()
    ) {
      return false;
    }
    if (this.get_pressed_direction() === 0) return false;
    return true;
  }

  override _Setup(): void {
    this.starting_from_stop = this.character.get_last_used_ability() === "Idle";
  }

  /** Walk.gd:play_animation_on_initialize — lead-in only when leaving Idle. */
  override play_animation_on_initialize(): void {
    if (this.character.get_last_used_ability() === "Idle") {
      this.play_animation("walk_start");
    } else {
      this.play_animation(this.animation);
    }
  }

  /** Walk.gd:_on_animatedSprite_animation_finished — walk_start -> walk. */
  private onAnimationFinished(): void {
    if (this.executing && this.character.get_animation() === "walk_start") {
      this.play_animation("walk");
    }
  }

  override _Update(_dt: number): void {
    if (this.timer < 0.08 && this.starting_from_stop) {
      this.set_movement_and_direction(this.horizontal_velocity / 4);
    } else {
      this.set_movement_and_direction(this.horizontal_velocity);
    }
    this.update_bonus_horizontal_only_conveyor();
  }

  override _Interrupt(): void {
    this.character.set_vertical_speed(0);
  }

  override _EndCondition(): boolean {
    const c = this.character;
    if (!c.is_on_floor()) return true;
    if (
      c.is_colliding_with_wall() !== 0 &&
      c.is_colliding_with_wall_except_feet() === this.get_pressed_direction()
    ) {
      return true;
    }
    if (this.timer > this.minimum_time && this.get_pressed_direction() === 0) {
      return true;
    }
    return false;
  }
}
