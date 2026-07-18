import { Ability } from '../ability/Ability.js';
import type { Character } from '../Character.js';
import {
  CHARGE_LEVEL_3,
  CHARGE_LEVEL_4,
  CHARGE_MAX_TIME,
  CHARGE_MIN_TIME,
} from '../../core/constants.js';

/**
 * Port of Charge.gd (buster) — holding fire accumulates charge; releasing above
 * the minimum threshold fires a charged shot whose level depends on hold time.
 * Independent action layer; coexists with Shot (tap = lemon, hold+release = charge).
 */
export class Charge extends Ability {
  readonly name = 'Charge';
  override independent = true;
  charged_time = 0;

  constructor(character: Character) {
    super(character);
    this.actions = ['fire'];
  }

  override should_execute_on_hold(): boolean {
    return true;
  }

  override _StartCondition(): boolean {
    return this.character.get_action_pressed('fire') && !this.character.block_charging;
  }

  override _Setup(): void {
    this.charged_time = 0;
  }

  override _Update(dt: number): void {
    if (this.character.get_action_pressed('fire')) {
      if (this.charged_time < CHARGE_MAX_TIME) this.charged_time += dt;
    } else {
      if (this.charged_time > CHARGE_MIN_TIME) {
        this.character.spawnBuster(this.get_charge_level());
      }
      this.EndAbility();
    }
  }

  get_charge_level(): number {
    if (this.charged_time < CHARGE_MIN_TIME) return 0;
    if (this.charged_time < CHARGE_LEVEL_3) return 1;
    if (this.charged_time < CHARGE_LEVEL_4) return 2;
    return 3;
  }

  override _EndCondition(): boolean {
    if (this.charged_time === 0 && this.timer > 0.1) return true;
    return false;
  }

  override _Interrupt(): void {
    this.charged_time = 0;
  }
}
