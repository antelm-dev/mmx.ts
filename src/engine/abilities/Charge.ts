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

  /** VFX latches — Charge.gd's `charging` / `mid_charge` / `max_charge`. */
  charging = false;
  mid_charge = false;
  max_charge = false;

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
    this.charging = false;
    this.mid_charge = false;
  }

  override _Update(dt: number): void {
    if (this.character.get_action_pressed('fire')) {
      this.charge(dt);
    } else {
      if (this.charged_time > CHARGE_MIN_TIME) {
        this.character.spawnBuster(this.get_charge_level());
      }
      this.EndAbility();
    }
  }

  /**
   * Charge.gd:charge — accumulate, and announce the two thresholds as they are
   * crossed. The original drives sound, a shader tint and three particle sprites
   * off these; here they are events so the renderer can do the same without the
   * engine knowing anything about drawing.
   */
  private charge(dt: number): void {
    if (this.charged_time < CHARGE_MAX_TIME) this.charged_time += dt;

    if (this.charged_time > CHARGE_MIN_TIME && !this.charging) {
      this.charging = true;
      this.character.events.emit('charge_started');
    }
    if (this.get_charge_level() > 1 && !this.mid_charge) {
      this.mid_charge = true;
      this.character.events.emit('charge_mid');
    }
    // The level-4 threshold no longer selects a projectile, but it still marks
    // where the original switches to the super-charge tint and particle.
    if (this.charged_time > CHARGE_LEVEL_4 && !this.max_charge) {
      this.max_charge = true;
      this.character.events.emit('charge_max');
    }
  }

  /**
   * Charge.gd:get_charge_level. Level 3 exists only for an upgraded arm cannon,
   * which this port does not model — and the buster's `shots` array has no fourth
   * projectile anyway, so it would clamp straight back onto the charged shot.
   */
  get_charge_level(): number {
    if (this.charged_time < CHARGE_MIN_TIME) return 0;
    if (this.charged_time < CHARGE_LEVEL_3) return 1;
    return 2;
  }

  override _EndCondition(): boolean {
    if (this.charged_time === 0 && this.timer > 0.1) return true;
    return false;
  }

  /** Charge.gd:_Interrupt -> stop_vfx — drop the charge and clear every latch. */
  override _Interrupt(): void {
    this.charged_time = 0;
    if (this.charging || this.mid_charge || this.max_charge) {
      this.character.events.emit('charge_stopped');
    }
    this.charging = false;
    this.mid_charge = false;
    this.max_charge = false;
  }
}
