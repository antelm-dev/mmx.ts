import { EnemyAbility } from "./EnemyAbility.js";
import type { Enemy } from "../Enemy.js";

/** Typed tuning for {@link Roll} (an enemy's `abilityConfig.Roll`). */
export interface RollConfig {
  speed: number;
  /** Turn toward the player once, the first frame the roller sees them. */
  facePlayer: boolean;
  /** Against a wall: reverse, or hold still until something interrupts the roll. */
  atWall: "turn" | "stop";
  conflicts: readonly string[];
}

/**
 * Endless roll — MMX1's Spiky, which "rolls forward in an attempt to collide
 * with the player" and never stops to rest.
 *
 * No Godot scene to port: it is {@link Patrol} with the leg and the rest taken
 * out. Patrol only ever walks one leg and leans on the AI's idle restart for the
 * pacing; Roll never ends, so the AI stays out of the way until damage, Stun or
 * Death interrupts it. Gravity runs every frame, so a roller drops off ledges.
 *
 * List Stun in `conflicts`: the interrupt is what stops the roll during a stun,
 * and the idle restart afterwards replays the `roll` clip (Initialize).
 */
export class Roll extends EnemyAbility {
  readonly name = "Roll";

  roll_speed: number;
  face_player: boolean;
  at_wall: "turn" | "stop";
  /** Whether this roll has already turned toward the player. */
  private faced = false;

  constructor(enemy: Enemy, config: RollConfig) {
    super(enemy);
    this.animation = "roll";
    this.conflicts = [...config.conflicts];
    this.roll_speed = config.speed;
    this.face_player = config.facePlayer;
    this.at_wall = config.atWall;
  }

  override _Setup(): void {
    this.faced = !this.face_player;
  }

  override _Update(dt: number): void {
    this.process_gravity(dt);

    // The roll starts on the first frame, usually before the player is in
    // vision, so the one turn waits for a target instead of happening in _Setup.
    if (!this.faced && this.target) {
      this.turn_and_face_player();
      this.faced = true;
    }

    // The full-height sensor the sweep fills, not Patrol's ray from the body
    // centre: that ray passes over a one-tile step under a tall body, and a
    // roll has no rest-and-turn to get it unstuck.
    if (this.character.is_colliding_with_wall() === this.character.get_facing_direction()) {
      if (this.at_wall === "stop") {
        this.force_movement(0);
        return;
      }
      this.turn();
    }
    this.force_movement(this.roll_speed);
  }
}
