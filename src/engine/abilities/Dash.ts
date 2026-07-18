import { Movement } from '../ability/Movement.js';
import type { Character } from '../Character.js';
import { DASH_DURATION, DASH_LEEWAY, DASH_SPEED } from '../../core/constants.js';

/**
 * Port of Dash.gd — grounded dash with a shrunk hitbox and an input buffer.
 * Dashing off a ledge ends the dash and starts a fast "dashfall".
 */
export class Dash extends Movement {
  readonly name: string = 'Dash';
  priority = 4;
  override animation = 'dash'; // Player.tscn (AirDash inherits it — there is a
  // separate `airdash` clip in the atlas, but X's AirDash node does not use it)

  dash_duration = DASH_DURATION;
  leeway = DASH_LEEWAY;
  protected left_ground_timer = 0;
  protected can_dash = true;

  constructor(character: Character) {
    super(character);
    this.actions = ['dash'];
    this.horizontal_velocity = DASH_SPEED;
  }

  override get_activation_leeway_time(): number {
    return this.leeway;
  }

  should_dash(): boolean {
    return this.character.is_on_floor();
  }

  override _StartCondition(): boolean {
    if (this.facing_a_wall()) return false;
    return this.should_dash();
  }

  override _Setup(): void {
    this.character.events.emit('dash');
    this.character.set_direction(this.get_pressed_direction());
    this.update_bonus_horizontal_only_conveyor();
    this.character.reduce_hitbox();
    this.changed_animation = false;
    this.left_ground_timer = 0;
    this.can_dash = true;
    this.consumeBuffer();
  }

  override _Update(dt: number): void {
    this.increase_left_ground_timer(dt);
    if (this.can_dash && this.should_dash()) {
      this.on_dash();
      this.force_movement(this.horizontal_velocity);
      if (!this.character.is_on_floor()) this.character.set_vertical_speed(0);
    } else {
      this.can_dash = false;
      if (this.left_ground_timer === 0) {
        this.left_ground_timer = 0.01;
        this.character.set_vertical_speed(0);
      }
      this.change_animation_if_falling('fall');
      this.set_movement_and_direction(this.horizontal_velocity);
      this.process_gravity(dt);
    }
  }

  private increase_left_ground_timer(dt: number): void {
    if (this.left_ground_timer > 0) this.left_ground_timer += dt;
  }

  protected on_dash(): void {}

  override change_animation_if_falling(_s: string): void {
    this.EndAbility();
    this.character.start_dashfall();
  }

  override _Interrupt(): void {
    if (!this.changed_animation) this.character.increase_hitbox();
    super._Interrupt();
  }

  protected Has_time_ran_out(): boolean {
    return this.dash_duration < this.timer;
  }

  override _EndCondition(): boolean {
    const c = this.character;
    if (this.facing_a_wall()) return true;
    if (c.is_on_floor()) {
      if (this.left_ground_timer > 0.1) return true;
      if (!this.Is_Input_Happening()) return true;
      if (this.Has_time_ran_out()) return true;
      if (c.facing_right && c.has_just_pressed_left()) {
        this.consumeBuffer();
        return true;
      }
      if (!c.facing_right && c.has_just_pressed_right()) {
        this.consumeBuffer();
        return true;
      }
    }
    return false;
  }
}
