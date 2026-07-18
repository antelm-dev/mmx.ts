import { EnemyAbility } from "./EnemyAbility.js";
import { BAT_JUMP_SPEED, BAT_JUMP_TIME } from "../../core/constants.js";
import type { Enemy } from "../Enemy.js";

/**
 * The hop the bat makes after it connects — port of BatJump.gd.
 *
 * It fires on contact damage, not on being hit, and it is what keeps the bat from
 * parking inside the player and draining the health bar: having landed a hit it
 * bounces up and out, then has to swoop back in for the next one. The upward
 * speed starts at 200 and eases to nothing over 0.7s, so the bat coasts to the
 * top of its arc rather than stopping there.
 */
export class Recoil extends EnemyAbility {
  readonly name = "Recoil";

  jump_time = BAT_JUMP_TIME;

  private vertical_speed = 0;

  constructor(enemy: Enemy) {
    super(enemy);
    this.animation = "jump";
    // Conflicts with nothing: the recoil always wins, and Pursuit names it so
    // that a chase in progress is interrupted by the hop.
    this.conflicts = [];
  }

  override _Setup(): void {
    this.force_movement(0);
    this.vertical_speed = -BAT_JUMP_SPEED;
  }

  override _Update(_dt: number): void {
    // Godot tweens `current_vertical_speed` from -200 to 0 with TRANS_CUBIC and
    // the default EASE_IN_OUT, then applies it every frame.
    const t = Math.min(1, this.timer / this.jump_time);
    this.vertical_speed = -BAT_JUMP_SPEED * (1 - easeInOutCubic(t));
    this.set_vertical_speed(this.vertical_speed);

    if (this.timer > this.jump_time) {
      this.play_animation("idle");
      this.EndAbility();
    }
  }
}

/** Godot's Tween.TRANS_CUBIC with the default EASE_IN_OUT. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
