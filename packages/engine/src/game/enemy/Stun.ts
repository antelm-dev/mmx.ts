import { EnemyAbility } from "./EnemyAbility.js";
import type { Enemy } from "../Enemy.js";

/** Typed tuning for {@link Stun} (an enemy's `abilityConfig.Stun`). */
export interface StunConfig {
  duration: number;
  animation: string;
  recoverAnimation: string;
  reactivateShield: boolean;
  gravity: boolean;
  conflicts: readonly string[];
}

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
  readonly name = "Stun";

  gravity: boolean;
  stun_duration: number;
  /** EnemyStun.reactivate_shield_on_end — false on Metool.tscn. */
  reactivate_shield_on_end: boolean;
  /**
   * EnemyStun.recover_animation, "" on Metool.tscn. With no recover clip, stage 1
   * tests the *stun* clip for completion — which is why "stun" must not loop.
   */
  recover_animation: string;

  constructor(enemy: Enemy, config: StunConfig) {
    super(enemy);
    this.animation = config.animation;
    // Empty on every current enemy: it interrupts everything that names it and
    // nothing can start on top of it.
    this.conflicts = [...config.conflicts];
    this.gravity = config.gravity;
    this.stun_duration = config.duration;
    this.reactivate_shield_on_end = config.reactivateShield;
    this.recover_animation = config.recoverAnimation;
  }

  override _Setup(): void {
    this.force_movement(0);
    this.character.deactivate_shield();
  }

  override _Update(dt: number): void {
    if (this.gravity) this.process_gravity(dt);

    if (this.attack_stage === 0 && this.timer > this.stun_duration) {
      if (this.recover_animation !== "") this.play_animation(this.recover_animation);
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
