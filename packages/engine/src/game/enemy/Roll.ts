import { EnemyAbility } from "./EnemyAbility.js";
import type { Enemy } from "../Enemy.js";

/** Typed tuning for {@link Roll} (an enemy's `abilityConfig.Roll`). */
export interface RollConfig {
  speed: number;
  /** Turn toward the player when the roll starts. */
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
 */
export class Roll extends EnemyAbility {
  readonly name = "Roll";

  roll_speed: number;
  face_player: boolean;
  at_wall: "turn" | "stop";

  constructor(enemy: Enemy, config: RollConfig) {
    super(enemy);
    this.animation = "roll";
    this.conflicts = [...config.conflicts];
    this.roll_speed = config.speed;
    this.face_player = config.facePlayer;
    this.at_wall = config.atWall;
  }

  override _Setup(): void {
    if (this.face_player) this.turn_and_face_player();
  }

  override _Update(dt: number): void {
    this.process_gravity(dt);

    // Patrol's probe, one pixel past the body rather than its Metool-sized 13,
    // so the turn lands before the sweep stops the roll flush against the tile.
    const wall = this.character.wall_ahead(this.character.hw + 1, 0);
    if (wall === this.character.get_facing_direction()) {
      if (this.at_wall === "stop") {
        this.force_movement(0);
        return;
      }
      this.turn();
    }
    this.force_movement(this.roll_speed);
  }
}
