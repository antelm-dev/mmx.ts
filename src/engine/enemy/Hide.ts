import { EnemyAbility } from "./EnemyAbility.js";
import {
  HIDE_ADVANCE_RANGE_X,
  HIDE_ADVANCE_RANGE_Y,
  HIDE_GIVE_UP_RANGE_X,
  HIDE_OPEN_DELAY,
  HIDE_RESHIELD_DELAY,
  WALK_SPEED,
} from "../../core/constants.js";
import type { Enemy } from "../Enemy.js";

/**
 * The Metool's whole fight — port of Hide.gd.
 *
 * It hides under its helmet, and only comes out when the player is looking the
 * other way. That single condition is what makes the Metool the enemy it is: you
 * cannot stand and shoot it, because facing it is exactly what keeps it shut, and
 * turning away is what invites it to close the distance. Under the helmet the
 * shield is up, so the body cannot be damaged at all.
 *
 * Stages: 0 hiding, 1 opening, 2 advancing — and back to 0 the moment the player
 * turns around again.
 */
export class Hide extends EnemyAbility {
  readonly name = "Hide";

  /**
   * Hide.gd advances with `horizontal_velocity`, which the Metool scene does not
   * override — so it inherits Movement.gd's 90, the player's own walk speed. The
   * charge is meant to be startling next to the 25px/s patrol.
   */
  horizontal_velocity = WALK_SPEED;

  /** Counts down the Tools.timer(0.1, "activate", shield) re-shield delay. */
  private reshield_in = -1;

  constructor(enemy: Enemy) {
    super(enemy);
    this.animation = "defense";
    this.conflicts = ["Stun"];
  }

  override _Setup(): void {
    this.force_movement(0);
    this.character.activate_shield();
    this.reshield_in = -1;
  }

  override _Update(dt: number): void {
    this.process_gravity(dt);
    this.tickReshield(dt);

    if (this.attack_stage === 0) {
      if (this.timer > HIDE_OPEN_DELAY && this.is_player_looking_away()) {
        this.turn_and_face_player();
        this.play_animation_once("open");
        this.character.deactivate_shield();
        this.next_attack_stage();
      }
      return;
    }

    if (this.attack_stage === 1) {
      // The helmet has to finish lifting before it can move — the window in
      // which the Metool is open *and* still standing there is the opening.
      if (!this.has_finished_last_animation()) return;
      if (
        this.is_player_nearby_horizontally(HIDE_ADVANCE_RANGE_X) &&
        this.is_player_nearby_vertically(HIDE_ADVANCE_RANGE_Y)
      ) {
        this.turn_and_face_player();
        this.play_animation_once("walk");
        this.force_movement(this.horizontal_velocity);
        this.next_attack_stage();
      } else {
        // Out of reach: drop back to the AI, which will re-raise Hide next frame
        // if the player is still in vision, or fall through to the patrol.
        this.EndAbility();
      }
      return;
    }

    if (this.attack_stage === 2) {
      if (!this.is_player_nearby_horizontally(HIDE_GIVE_UP_RANGE_X)) {
        this.EndAbility();
      } else if (!this.is_player_looking_away()) {
        this.force_movement(0);
        // The shield comes back a beat *after* the helmet starts closing, so a
        // shot already in the air during the turn still connects.
        this.reshield_in = HIDE_RESHIELD_DELAY;
        this.play_animation_once("defense");
        this.go_to_attack_stage(0);
      }
    }
  }

  override _Interrupt(): void {
    super._Interrupt();
    this.character.deactivate_shield();
  }

  private tickReshield(dt: number): void {
    if (this.reshield_in < 0) return;
    this.reshield_in -= dt;
    if (this.reshield_in <= 0) {
      this.reshield_in = -1;
      this.character.activate_shield();
    }
  }

  /**
   * Hide.gd:is_player_looking_away — true when the player faces the same way as
   * the enemy-to-player direction, i.e. away from the Metool.
   *
   * Without a target there is nobody to hide from, so it reads as "looking
   * away"; the range checks in stages 1 and 2 are what actually gate the advance.
   */
  is_player_looking_away(): boolean {
    const target = this.character.target;
    if (!target) return true;
    return this.get_player_direction_relative() === target.get_facing_direction();
  }
}
