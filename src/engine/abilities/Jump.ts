import { Fall } from './Fall.js';
import type { Character } from '../Character.js';
import {
  JUMP_FULLSPEED_PROPORTION,
  JUMP_LEEWAY,
  JUMP_MAX_TIME,
} from '../../core/constants.js';

/**
 * Port of Jump.gd — variable-height jump (extends Fall).
 * Ascends at full speed for a fraction of max_jump_time, then decays; releasing
 * jump cuts the rise. Ends at the apex (change_animation_if_falling -> EndAbility),
 * handing off to Fall for the descent.
 */
export class Jump extends Fall {
  readonly name: string = 'Jump';
  priority = 5;

  max_jump_time = JUMP_MAX_TIME;
  leeway_time = JUMP_LEEWAY;
  fullspeed_proportion = JUMP_FULLSPEED_PROPORTION;
  minimum_upwards_time = 0.0;

  protected fullspeed_time = 0;
  protected slowdown_time = 0;
  protected stopped_input = false;

  constructor(character: Character) {
    super(character);
    this.actions = ['jump'];
    character.events.on('headbump', () => this.on_headbump());
  }

  override get_activation_leeway_time(): number {
    return this.character.is_executing('Jump') ? 0 : this.leeway_time;
  }

  override _StartCondition(): boolean {
    return (
      this.character.has_just_been_on_floor(this.leeway_time) &&
      this.character.get_last_used_ability() !== 'DashJump'
    );
  }

  override _Setup(): void {
    this.character.events.emit('jump');
    this.fullspeed_time = 0;
    this.slowdown_time = 0;
    this.changed_animation = false;
    this.stopped_input = false;
    this.character.set_vertical_speed(0);
    this.zero_bonus_horizontal_speed();
    this.consumeBuffer();
    this.play_animation('jump');
  }

  override _Update(dt: number): void {
    this.if_no_input_zero_vertical_speed();
    this.ascent_with_slowdown_after_delay(dt);
    super._Update(dt); // Fall: gravity + air control + change_animation_if_falling
  }

  protected if_no_input_zero_vertical_speed(): void {
    if (this.character.get_vertical_speed() < 0 && this.no_input_after_minimum_time()) {
      this.character.set_vertical_speed(0);
      this.stopped_input = true;
    }
  }

  private no_input_after_minimum_time(): boolean {
    return this.timer > this.minimum_upwards_time && !this.character.get_action_pressed('jump');
  }

  override change_animation_if_falling(_s: string): void {
    if (
      !this.changed_animation &&
      this.character.get_animation() !== 'fall' &&
      this.character.get_vertical_speed() > 0
    ) {
      this.EndAbility();
    }
  }

  protected ascent_with_slowdown_after_delay(dt: number): void {
    if (!this.stopped_input && this.calculate_slowdown_value() !== 0) {
      if (this.can_go_up_at_full_velocity()) {
        this.character.set_vertical_speed(-this.jump_velocity);
        this.fullspeed_time += dt;
      } else {
        this.character.set_vertical_speed(-this.jump_velocity * this.calculate_slowdown_value());
        this.slowdown_time += dt;
      }
    }
  }

  private can_go_up_at_full_velocity(): boolean {
    return this.fullspeed_time / this.max_jump_time < this.fullspeed_proportion;
  }

  // Faithful to Jump.gd:65-69 (including its operator precedence).
  protected calculate_slowdown_value(): number {
    const sv =
      this.max_jump_time -
      this.fullspeed_time -
      this.slowdown_time / (this.max_jump_time - this.fullspeed_time);
    return sv < 0 ? 0 : sv;
  }

  override _EndCondition(): boolean {
    return this.character.is_on_floor() && this.changed_animation;
  }

  protected on_headbump(): void {
    if (this.executing) {
      this.character.set_vertical_speed(0);
      this.stopped_input = true;
    }
  }
}
