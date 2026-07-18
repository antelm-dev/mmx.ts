import { Ability } from "./Ability.js";
import { GRAVITY, JUMP_VELOCITY, WALK_SPEED } from "../../core/constants.js";

/**
 * Physics/movement helpers — port of Movement.gd.
 * All locomotion states extend this.
 */
export abstract class Movement extends Ability {
  horizontal_velocity = WALK_SPEED;
  jump_velocity = JUMP_VELOCITY;
  changed_animation = false;

  get_horizontal_velocity(): number {
    return this.horizontal_velocity;
  }
  get_jump_velocity(): number {
    return this.jump_velocity;
  }

  process_gravity(dt: number, gravity = GRAVITY): void {
    this.character.add_vertical_speed(gravity * dt);
    if (this.character.get_vertical_speed() > this.character.maximum_fall_velocity) {
      this.character.set_vertical_speed(this.character.maximum_fall_velocity);
    }
  }

  set_movement_and_direction(h: number): void {
    this.character.set_direction(this.get_pressed_direction());
    this.character.set_horizontal_speed(h * this.character.get_direction());
  }

  update_bonus_horizontal_only_conveyor(extra = 0): void {
    if (this.character.is_on_floor()) {
      this.character.set_bonus_horizontal_speed(this.character.get_conveyor_belt_speed() + extra);
    }
  }

  zero_bonus_horizontal_speed(): void {
    this.character.set_bonus_horizontal_speed(0);
  }

  force_movement(h: number): void {
    this.character.set_horizontal_speed(h * this.character.get_facing_direction());
  }

  set_direction_as_pressed_direction(): void {
    this.character.set_direction(this.get_pressed_direction());
  }

  facing_a_wall(): boolean {
    return this.character.is_colliding_with_wall() === this.character.get_facing_direction();
  }

  pressing_towards_wall(): boolean {
    const w = this.character.is_colliding_with_wall();
    return w !== 0 && w === this.get_pressed_direction();
  }

  facing_in_range_for_walljump(): boolean {
    const r = this.character.is_in_reach_for_walljump();
    return r !== 0 && r === this.character.get_facing_direction();
  }

  get_facing_direction(): number {
    return this.character.get_facing_direction();
  }

  get_vertical_speed(): number {
    return this.character.get_vertical_speed();
  }

  set_vertical_speed(v: number, snap = true): void {
    this.character.set_vertical_speed(v, snap);
  }

  change_animation_if_falling(anim: string): void {
    if (
      !this.changed_animation &&
      this.character.get_animation() !== "fall" &&
      this.character.get_vertical_speed() > 0
    ) {
      this.play_animation(anim);
      this.changed_animation = true;
    }
  }

  override _Interrupt(): void {
    this.character.set_horizontal_speed(0);
    this.character.set_vertical_speed(0);
    this.zero_bonus_horizontal_speed();
  }

  on_dash_press(): void {
    this.character.last_time_dashed = this.get_time();
  }

  dash_input_not_too_long_ago(leeway: number): boolean {
    return this.get_time() - this.character.last_time_dashed < leeway * 1000;
  }

  // Low walljump raycast anti-glitch toggles are cosmetic here — kept as no-ops
  // so the ported ability code reads identically to the source.
  deactivate_low_jumpcasts(): void {}
  activate_low_jumpcasts_after_delay(_dt: number): void {}
}
