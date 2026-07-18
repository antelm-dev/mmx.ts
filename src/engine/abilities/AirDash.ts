import { Dash } from './Dash.js';
import type { Character } from '../Character.js';
import { AIRDASH_DURATION, AIRDASH_MAX, AIRDASH_SPEED } from '../../core/constants.js';

/**
 * Port of AirDash.gd — a horizontal air dash with a limited count that refills on
 * land / wallslide / walljump. (The double-jump "AirJump" re-dash chain from the
 * Icarus legs is left out of this movement-core port.)
 */
export class AirDash extends Dash {
  readonly name = 'AirDash';
  priority = 5;

  max_airdashes = AIRDASH_MAX;
  airdash_count = AIRDASH_MAX;
  // AirDash/dash_particle is a *different* sheet (airdash.png at (-16, 4), 32fps),
  // which this port has not brought over — so no puff rather than the ground one.
  protected override smoke_fx: string | null = null;
  private initial_direction = 1;

  constructor(character: Character) {
    super(character);
    this.horizontal_velocity = AIRDASH_SPEED;
    this.dash_duration = AIRDASH_DURATION;
    character.events.on('land', () => this.resetCount());
    character.events.on('wallslide', () => this.resetCount());
    character.events.on('walljump', () => this.resetCount());
    character.events.on('dashjump', () => this.reduceCount());
  }

  private resetCount(): void {
    this.airdash_count = this.max_airdashes;
  }
  private reduceCount(): void {
    this.airdash_count -= 1;
  }

  override should_dash(): boolean {
    return (
      !this.has_let_go_of_input &&
      !this.character.is_on_floor() &&
      !this.Has_time_ran_out() &&
      !this.facing_a_wall()
    );
  }

  override _StartCondition(): boolean {
    return this.should_dash() && this.airdash_count > 0;
  }

  override _Setup(): void {
    super._Setup();
    this.character.set_vertical_speed(0);
    this.airdash_count -= 1;
    this.left_ground_timer = 0;
    this.initial_direction = this.character.get_facing_direction();
    this.character.airdash_signal();
  }

  override change_animation_if_falling(_s: string): void {
    this.EndAbility();
    this.character.start_dashfall();
  }

  override _EndCondition(): boolean {
    return this.pressing_towards_wall() || this.character.is_on_floor();
  }
}
