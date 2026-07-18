import { Ability } from '../ability/Ability.js';
import type { Character } from '../Character.js';
import { SHOT_ARM_POINT_DURATION } from '../../core/constants.js';

/**
 * Port of Shot.gd / PrimaryShot.gd (buster only) — fires an uncharged "lemon" on
 * each fire tap and keeps the arm-point pose for a short window. Runs on the
 * independent action layer, concurrent with any movement state.
 */
export class Shot extends Ability {
  readonly name = 'Shot';
  override independent = true;
  private arm_point_duration = SHOT_ARM_POINT_DURATION;

  constructor(character: Character) {
    super(character);
    this.actions = ['fire'];
  }

  override _StartCondition(): boolean {
    return true; // buster has infinite ammo
  }

  override _Setup(): void {
    this.fire();
  }

  override _Update(_dt: number): void {
    if (this.character.get_action_just_pressed('fire') && !this.is_initial_frame()) {
      this.fire();
    }
  }

  private fire(): void {
    this.timer = 0;
    this.character.spawnBuster(0);
  }

  private Has_time_ran_out(): boolean {
    return this.arm_point_duration < this.timer;
  }

  override _EndCondition(): boolean {
    return !this.character.get_action_just_pressed('fire') && this.Has_time_ran_out();
  }
}
