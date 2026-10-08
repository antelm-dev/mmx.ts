import { EnemyAbility } from "./EnemyAbility.js";
import { Projectile } from "../Projectile.js";
import type { ShotStats } from "../../core/constants.js";
import type { Enemy } from "../Enemy.js";

/**
 * Stop, aim at the player, fire one straight shot, hold the pose — the Pantheon
 * Hunter's attack (zero-x-mashup enemy.rs `think`, "aim" -> "shoot").
 *
 * Raised by the AI while the player is in vision; the cooldown gates the start,
 * so between shots the AI falls back to whatever answers idle (Patrol).
 */
export class Shoot extends EnemyAbility {
  readonly name = "Shoot";

  /** enemies.json shot_cooldown: 100 frames between shots. */
  cooldown = 100 / 60;
  /** enemy.rs holds the shoot pose 24 frames before going idle. */
  recover_time = 24 / 60;

  /** Enemy clock (ms) at which the next shot may start; enemy.rs spawns at half a cooldown. */
  private ready_at: number;

  constructor(
    enemy: Enemy,
    readonly shot: ShotStats,
  ) {
    super(enemy);
    this.animation = "aim";
    this.conflicts = ["Stun"];
    this.ready_at = (this.cooldown / 2) * 1000;
  }

  override _StartCondition(): boolean {
    return this.character.clockMs >= this.ready_at;
  }

  override _Setup(): void {
    this.force_movement(0);
    this.turn_and_face_player();
  }

  override _Update(dt: number): void {
    this.process_gravity(dt);

    if (this.attack_stage === 0) {
      if (!this.has_finished_last_animation()) return;
      const enemy = this.character;
      enemy.projectiles.push(
        new Projectile(
          enemy.pos.x,
          enemy.pos.y,
          enemy.get_facing_direction(),
          0,
          enemy.rng,
          undefined,
          this.shot,
        ),
      );
      this.ready_at = enemy.clockMs + this.cooldown * 1000;
      this.play_animation("shoot");
      this.next_attack_stage();
      return;
    }

    if (this.timer > this.recover_time) {
      this.play_animation("idle");
      this.EndAbility();
    }
  }
}
