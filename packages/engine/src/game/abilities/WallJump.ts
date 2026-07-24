import { Jump } from "./Jump.js";
import type { DashWallJump } from "./DashWallJump.js";
import {
  WALLJUMP_MOVEAWAY_DURATION,
  WALLJUMP_MOVEAWAY_SPEED,
  WALLJUMP_START_DELAY,
} from "../../core/constants.js";

/**
 * Port of Walljump.gd — kick off a wall (extends Jump). A start_delay freezes X
 * briefly, then a move-away push, then normal Jump ascent/air-control. Only fires
 * when dash is NOT held; holding dash routes to DashWallJump instead, and tapping
 * dash within the first 0.25s converts an in-progress wall-kick into a DashWallJump.
 */
export class WallJump extends Jump {
  readonly name: string = "WallJump";
  // Wall context outranks grounded moves (Jump/DashJump) when on a wall.
  priority = 7;
  override animation = "walljump"; // Player.tscn (DashWallJump inherits it)

  start_delay = WALLJUMP_START_DELAY;
  move_away_duration = WALLJUMP_MOVEAWAY_DURATION;
  move_away_speed = WALLJUMP_MOVEAWAY_SPEED;
  private walljump_direction = 0;
  private headbumped = false;
  private emitted_jump_signal = false;

  override _StartCondition(): boolean {
    const c = this.character;
    if (c.is_on_floor()) return false;
    if (c.is_in_reach_for_walljump() !== 0 && !c.get_action_pressed("dash")) return true;
    return false;
  }

  override _Setup(): void {
    super._Setup();
    this.emitted_jump_signal = false;
    this.character.events.emit("walljump");
    this.walljump_direction = -this.character.is_in_reach_for_walljump();
    this.character.set_direction(-this.walljump_direction);
    this.headbumped = false;
    this.character.set_horizontal_speed(0);
    this.character.set_vertical_speed(0);
    this.character.pos.x += 2 * this.walljump_direction;
    this.character.pos.y -= 2;
  }

  override _Update(dt: number): void {
    // Walljump.execute_dashwalljump_on_input: tapping dash early converts this
    // wall-kick into a DashWallJump, carrying the current timer over.
    if (this.tryConvertToDashWallJump()) return;
    super._Update(dt);
  }

  protected tryConvertToDashWallJump(): boolean {
    if (this.timer < 0.25 && this.character.get_action_just_pressed("dash")) {
      const dwj = this.character.get_ability("DashWallJump") as DashWallJump | undefined;
      if (dwj && !dwj.executing) {
        const t = this.timer;
        this.EndAbility();
        dwj.override_timer = t;
        dwj.startRightAway();
        return true;
      }
    }
    return false;
  }

  override _EndCondition(): boolean {
    if (
      this.timer > 0.05 + this.start_delay &&
      this.facing_a_wall() &&
      this.character.get_vertical_speed() > 0
    ) {
      return true;
    }
    return super._EndCondition();
  }

  protected override if_no_input_zero_vertical_speed(): void {
    if (this.timer > this.move_away_duration) super.if_no_input_zero_vertical_speed();
  }

  override set_movement_and_direction(h: number): void {
    if (this.delay_has_expired()) {
      if (this.delay_and_move_away_duration_have_expired()) {
        super.set_movement_and_direction(h);
      } else {
        this.move_away_from_wall();
      }
    }
  }

  protected override ascent_with_slowdown_after_delay(dt: number): void {
    if (this.delay_has_expired()) {
      if (!this.emitted_jump_signal) {
        this.character.events.emit("jump");
        this.emitted_jump_signal = true;
      }
      super.ascent_with_slowdown_after_delay(dt);
    }
  }

  override process_gravity(dt: number, gravity?: number): void {
    if (this.delay_has_expired()) super.process_gravity(dt, gravity);
  }

  protected move_away_from_wall(): void {
    this.character.set_horizontal_speed(
      this.move_away_speed * -this.character.get_facing_direction(),
    );
  }

  override pressing_towards_wall(): boolean {
    return (
      this.get_pressed_direction() !== 0 && this.get_pressed_direction() !== this.walljump_direction
    );
  }

  private delay_and_move_away_duration_have_expired(): boolean {
    return this.timer > this.start_delay + this.move_away_duration || this.headbumped;
  }

  private delay_has_expired(): boolean {
    return this.timer > this.start_delay;
  }

  protected override on_headbump(): void {
    if (this.executing) {
      this.character.set_vertical_speed(0);
      this.stopped_input = true;
      this.headbumped = true;
    }
  }
}
