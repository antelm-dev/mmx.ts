import { EnemyAbility } from "./EnemyAbility.js";
import {
  BAT_PURSUIT_GIVE_UP_DISTANCE,
  BAT_PURSUIT_SPEED,
  BAT_WEAVE_RATE,
} from "../../core/constants.js";
import type { Enemy } from "../Enemy.js";

/**
 * Homing flight — port of BatPursuit.gd.
 *
 * It flies straight at the player, but the vertical component is scaled by a
 * cosine remapped to [-0.25, 1]: rising is damped to a quarter and diving runs at
 * full speed, so the bat swoops rather than tracking like a missile. Without that
 * asymmetry a homing flier is trivially outrun by walking; with it the bat
 * repeatedly overshoots and comes back around.
 */
export class Pursuit extends EnemyAbility {
  readonly name = "Pursuit";

  pursuit_speed = BAT_PURSUIT_SPEED;
  /** BatPursuit's give-up range, as a field so tooling can read it off the ability. */
  give_up_distance = BAT_PURSUIT_GIVE_UP_DISTANCE;

  constructor(enemy: Enemy) {
    super(enemy);
    this.animation = "idle";
    this.conflicts = ["Recoil"];
  }

  /**
   * BatPursuit._Setup also sets the sprite's speed_scale to 1.5 so the wings
   * beat faster in the chase. The engine's AnimationPlayer plays clips at their
   * authored rate and has no speed scale, so that is left out rather than faked
   * by duplicating the clip at a second frame rate.
   */

  /** BatPursuit._EndCondition — it gives up rather than following forever. */
  override _EndCondition(): boolean {
    return this.get_distance_to_player() > this.give_up_distance;
  }

  override _Update(_dt: number): void {
    const target = this.character.target;
    if (!target) return;

    const dx = target.pos.x - this.character.pos.x;
    const dy = target.pos.y - this.character.pos.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;

    this.set_direction(dx > 0 ? 1 : -1);
    this.set_horizontal_speed(this.pursuit_speed * (dx / length));
    this.set_vertical_speed(
      this.pursuit_speed * (dy / length) * remap(Math.cos(this.timer * BAT_WEAVE_RATE)),
    );
  }
}

/** Godot's `remap(v, -1, 1, -0.25, 1)`. */
function remap(v: number): number {
  return -0.25 + ((v + 1) / 2) * 1.25;
}
