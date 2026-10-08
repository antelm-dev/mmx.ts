import { Jump, type JumpConfig } from "./Jump.js";
import type { Character } from "../Character.js";
import { DASH_DURATION, DASHJUMP_SPEED } from "../../core/constants.js";

/** Typed tuning for {@link DashJump}; the Jump keys come from the loadout's jump slot. */
export interface DashJumpConfig extends JumpConfig {
  speed?: number;
  dashDuration?: number;
}

/**
 * Port of DashJump.gd — a jump performed while dashing (dash held + pressed
 * recently). Retains dash-level horizontal air control for a long jump arc.
 */
export class DashJump extends Jump {
  readonly name = "DashJump";
  priority = 6;
  // Player.tscn gives DashJump animation = "jump" — it reuses the jump pose, there
  // is no separate dash-jump clip.

  private dash_leeway_time: number;

  constructor(character: Character, config: DashJumpConfig = {}) {
    super(character, config);
    this.horizontal_velocity = config.speed ?? DASHJUMP_SPEED;
    this.dash_leeway_time = config.dashDuration ?? DASH_DURATION;
    character.events.on("input_dash", () => this.on_dash_press());
  }

  override _Setup(): void {
    super._Setup();
    this.character.dashjump_signal();
    this.character.events.emit("dash");
  }

  override change_animation_if_falling(_s: string): void {
    if (
      !this.changed_animation &&
      this.character.get_animation() !== "fall" &&
      this.character.get_vertical_speed() > 0
    ) {
      this.EndAbility();
      this.character.start_dashfall();
    }
  }

  override _StartCondition(): boolean {
    if (
      this.character.get_action_pressed("dash") &&
      this.dash_input_not_too_long_ago(this.dash_leeway_time)
    ) {
      return super._StartCondition();
    }
    return false;
  }
}
