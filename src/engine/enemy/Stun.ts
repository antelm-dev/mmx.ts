import { EnemyAbility } from './EnemyAbility.js';
import { STUN_DURATION } from '../../core/constants.js';
import type { Enemy } from '../Enemy.js';

/**
 * Guard-break stun — port of EnemyStun.gd.
 *
 * This is the reward for the charged buster. A shot that breaks the shield drops
 * the Metool out of whatever it was doing and leaves it open and motionless for
 * 1.65s, which is long enough to kill it outright. The scene sets
 * `reactivate_shield_on_end = false`, so the guard does not come back when the
 * stun ends — a broken guard stays broken until the Metool hides again of its
 * own accord.
 */
export class Stun extends EnemyAbility {
  readonly name = 'Stun';

  gravity = true;
  stun_duration = STUN_DURATION;
  /** EnemyStun.reactivate_shield_on_end — false on Metool.tscn. */
  reactivate_shield_on_end = false;
  /**
   * EnemyStun.recover_animation, "" on Metool.tscn. With no recover clip, stage 1
   * tests the *stun* clip for completion — which is why "stun" must not loop.
   */
  recover_animation = '';

  constructor(enemy: Enemy) {
    super(enemy);
    this.animation = 'stun';
    // Conflicts with nothing, so it interrupts everything that names it and
    // nothing can start on top of it.
    this.conflicts = [];
  }

  override _Setup(): void {
    this.force_movement(0);
    this.character.deactivate_shield();
  }

  override _Update(dt: number): void {
    if (this.gravity) this.process_gravity(dt);

    if (this.attack_stage === 0 && this.timer > this.stun_duration) {
      if (this.recover_animation !== '') this.play_animation(this.recover_animation);
      this.next_attack_stage();
    } else if (this.attack_stage === 1 && this.has_finished_last_animation()) {
      this.EndAbility();
    }
  }

  override _Interrupt(): void {
    super._Interrupt();
    if (this.reactivate_shield_on_end && this.character.has_health()) {
      this.character.activate_shield();
    }
  }
}
