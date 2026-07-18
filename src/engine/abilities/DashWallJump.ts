import { WallJump } from './WallJump.js';
import type { Character } from '../Character.js';
import { DASHJUMP_SPEED } from '../../core/constants.js';

/**
 * Port of DashWallJump.gd — a wall-kick performed while holding dash (extends
 * WallJump). Kicks off with dash-level horizontal speed for a long diagonal jump.
 * Triggered either by holding dash + jump on a wall, or by tapping dash within the
 * first 0.25s of a normal WallJump (which hands off via override_timer/startRightAway).
 */
export class DashWallJump extends WallJump {
  readonly name: string = 'DashWallJump';
  override_timer = 0;

  constructor(character: Character) {
    super(character);
    this.horizontal_velocity = DASHJUMP_SPEED; // dash-speed air control + kick-off
    character.events.on('input_dash', () => this.on_dash_press());
  }

  override _StartCondition(): boolean {
    const c = this.character;
    if (c.is_on_floor()) return false;
    if (c.get_action_pressed('dash') && c.is_in_reach_for_walljump() !== 0) return true;
    return false;
  }

  override _Setup(): void {
    super._Setup();
    this.character.events.emit('dash');
    this.character.dashjump_signal();
    if (this.override_timer > 0) this.override_dash();
  }

  private override_dash(): void {
    this.timer = this.override_timer;
    this.override_timer = 0;
  }

  /** Called by WallJump when the player taps dash mid-wall-kick. */
  startRightAway(): void {
    this.ExecuteOnce();
  }

  override change_animation_if_falling(_s: string): void {
    if (
      !this.changed_animation &&
      this.character.get_animation() !== 'fall' &&
      this.character.get_vertical_speed() > 0
    ) {
      this.EndAbility();
      this.character.start_dashfall();
    }
  }

  // Kick away from the wall at dash speed (not the slow WallJump move-away).
  protected override move_away_from_wall(): void {
    this.character.set_horizontal_speed(
      this.horizontal_velocity * -this.character.get_facing_direction(),
    );
  }

  // Already converted from a WallJump — don't convert again.
  protected override tryConvertToDashWallJump(): boolean {
    return false;
  }
}
