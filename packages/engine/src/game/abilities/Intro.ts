import { Movement } from "../ability/Movement.js";
import type { Character } from "../Character.js";
import {
  PLAYER_INTRO_BEAM_SPEED,
  PLAYER_INTRO_DROP_HEIGHT,
  PLAYER_INTRO_THUNDER_WINDOW,
} from "../../core/constants.js";

/**
 * X's level-start entrance — port of Intro.gd (Player.tscn's Intro node).
 *
 * Event-driven like Damage/Death rather than polled: `_StartCondition` never
 * fires true on its own; {@link Player.beginIntro} calls `ExecuteOnce` once, from
 * `Scene`'s constructor, so a bare `new Player()` (every engine test, the headless
 * sim) never sees it and behaves exactly as it did before this ability existed.
 *
 * Four phases, chained by clip name rather than by a sub-state enum, matching the
 * original:
 *
 *  1. `visual` — a static held frame (the `beam` clip) drops straight down from
 *     {@link PLAYER_INTRO_DROP_HEIGHT} px above the spawn point to the spawn's
 *     own y, ignoring collision. This is the decorative beam-of-light column;
 *     Intro.gd does the equivalent by moving a sibling sprite node instead of
 *     the physics body, which this port has no equivalent of (Actor is the only
 *     thing the renderer draws — see sprite.ts), so the body itself makes the
 *     trip.
 *  2. `settle` — back at the spawn point, an ordinary collision-driven descent
 *     at the same speed, exactly like Fall, until `is_on_floor()`. Spawn points
 *     are authored a little above the ground rather than flush with it (see
 *     level.test.ts, "sits in open air above a floor"), so this covers whatever
 *     that gap happens to be instead of guessing at it with a raycast the way
 *     Intro.gd's `get_ground_height` does.
 *  3. `beam_in` plays once, then hands off to `beam_equip`.
 *  4. `beam_equip` plays once and ends the ability; the window between
 *     {@link PLAYER_INTRO_THUNDER_WINDOW} fires `x_appear` once, for the
 *     renderer's equip-clang sound cue.
 */
export class Intro extends Movement {
  readonly name = "Intro";
  priority = 150;
  override animation = "beam"; // Player.tscn Intro node

  private hasRun = false;
  private phase: "visual" | "settle" | "landed" = "visual";
  private spawnY = 0;
  private equipTimer = 0;
  private thunderPlayed = false;

  constructor(character: Character) {
    super(character);
    character.events.on("animation_finished", (anim: string) => this.onAnimationFinished(anim));
  }

  /** Never picked by the per-frame poll — {@link Player.beginIntro} starts it directly. */
  override _StartCondition(): boolean {
    return false;
  }

  override _Setup(): void {
    this.hasRun = true;
    this.character.stop_all_movement();
    this.character.listening_to_inputs = false;
    this.spawnY = this.character.pos.y;
    this.character.pos.y = this.spawnY - PLAYER_INTRO_DROP_HEIGHT;
    this.phase = "visual";
  }

  override _Update(dt: number): void {
    switch (this.phase) {
      case "visual":
        this.updateVisualDescent(dt);
        return;
      case "settle":
        this.updateSettle();
        return;
      case "landed":
        this.updateEquip(dt);
        return;
    }
  }

  private updateVisualDescent(dt: number): void {
    this.character.pos.y = Math.min(
      this.character.pos.y + PLAYER_INTRO_BEAM_SPEED * dt,
      this.spawnY,
    );
    if (this.character.pos.y >= this.spawnY) {
      this.phase = "settle";
      this.character.set_vertical_speed(PLAYER_INTRO_BEAM_SPEED);
    }
  }

  private updateSettle(): void {
    if (this.character.is_on_floor()) {
      this.character.set_vertical_speed(0);
      this.phase = "landed";
      this.play_animation_once("beam_in");
    } else {
      this.character.set_vertical_speed(PLAYER_INTRO_BEAM_SPEED);
    }
  }

  private updateEquip(dt: number): void {
    if (this.character.get_animation() !== "beam_equip") return;
    this.process_gravity(dt);
    this.equipTimer += dt;
    const [from, to] = PLAYER_INTRO_THUNDER_WINDOW;
    if (!this.thunderPlayed && this.equipTimer >= from && this.equipTimer <= to) {
      this.thunderPlayed = true;
      this.character.events.emit("x_appear");
    }
  }

  /** Intro.gd:on_animation_finished — beam_in -> beam_equip -> end. */
  private onAnimationFinished(anim: string): void {
    if (!this.executing) return;
    if (anim === "beam_in") {
      this.equipTimer = 0;
      this.thunderPlayed = false;
      this.play_animation_once("beam_equip");
    } else if (anim === "beam_equip") {
      this.EndAbility();
    }
  }

  /** Never ends on its own condition — the animation handoff above ends it. */
  override _EndCondition(): boolean {
    return false;
  }

  /** Intro.gd:_Interrupt — hand control back once the sequence has played out. */
  override _Interrupt(): void {
    super._Interrupt();
    this.character.listening_to_inputs = true;
    this.character.events.emit("gameplay_start");
  }

  /** Guards against a second {@link Player.beginIntro} call re-starting this. */
  get hasStarted(): boolean {
    return this.hasRun;
  }
}
