import { Ability } from "../ability/Ability.js";
import type { Character } from "../Character.js";
import type { SlashStep } from "../../data/types.js";

/** Typed tuning for {@link Slash}, supplied by the loadout. */
export interface SlashConfig {
  slash1: SlashStep;
  slash2: SlashStep;
  slash3: SlashStep;
  dashSlash: SlashStep;
  jumpSlash: SlashStep;
  wallSlash: SlashStep;
  /** Effect clip for the impact spark (see {@link MeleeSpec.hitFx}). */
  hitFx: string;
}

type StepKey = Exclude<keyof SlashConfig, "hitFx">;

/** Ground swings hold the player in place; air and wall swings keep locomotion. */
const GROUNDED: ReadonlySet<StepKey> = new Set(["slash1", "slash2", "slash3", "dashSlash"]);
const CHAIN: Partial<Record<StepKey, StepKey>> = { slash1: "slash2", slash2: "slash3" };

/**
 * Saber swings on the fire button — port of Zero::update's slash branch in the
 * zero-x-mashup reference (engine/src/player.rs). Action layer, so locomotion
 * keeps running underneath; the variant is picked from the locomotion state the
 * press lands in, and the strike itself is a {@link Character.startMelee} box.
 *
 * Timings are frames from the swing's first tick (counted, not timed, so a
 * replay hits on exactly the same ticks).
 */
export class Slash extends Ability {
  readonly name = "Slash";
  override independent = true;
  private step: StepKey = "slash1";
  private frame = 0;
  private clipFrame = 0;

  constructor(
    character: Character,
    private readonly config: SlashConfig,
  ) {
    super(character);
    this.actions = ["fire"];
  }

  override _StartCondition(): boolean {
    return !this.character.is_executing_either(["Damage", "Death", "Shot", "Charge"]);
  }

  /** The step picks the clip in begin(), not Initialize. */
  override play_animation_on_initialize(): void {}

  override _Setup(): void {
    this.begin(this.pick());
  }

  override _Update(_dt: number): void {
    const c = this.character;
    if (c.get_action_just_pressed("fire") && !this.is_initial_frame()) {
      const next = CHAIN[this.step];
      if (next && this.frame < this.current.chainWindow) {
        this.begin(next);
      } else if (!GROUNDED.has(this.step)) {
        this.begin(this.pick()); // the reference restarts air and wall swings on every press
      }
    }

    const step = this.current;
    if (this.frame === step.activeFrom) {
      const { x, y, w, h } = step.hitbox;
      // The reference faces the wall while sliding, this engine faces away from
      // it, so the wall slash box (measured behind the reference's facing) flips.
      const side = this.step === "wallSlash" ? -1 : 1;
      c.startMelee({
        // Sheet boxes are measured from the feet; the body origin is its centre.
        box: { hw: w / 2, hh: h / 2, ox: side * (x + w / 2), oy: y + h / 2 + c.hh },
        damage: step.damage,
        activeFrames: step.activeTo - step.activeFrom + 1,
        hitFx: this.config.hitFx,
      });
    }
    if (GROUNDED.has(this.step)) c.set_horizontal_speed(0);
    // A locomotion change (Jump -> Fall, Idle starting) replays its own clip;
    // the swing keeps the sprite until it ends.
    if (c.get_animation() !== step.animation) c.play_animation(step.animation, this.clipFrame);
    this.clipFrame = c.anim.frame;
    this.frame++;
  }

  override _EndCondition(): boolean {
    const c = this.character;
    if (c.is_executing_either(["Damage", "Death"])) return true;
    if (this.frame >= this.current.duration) return true;
    if (this.step === "wallSlash") return !c.is_executing("WallSlide");
    if (this.step === "jumpSlash") return c.is_on_floor();
    return !c.is_on_floor();
  }

  override _Interrupt(): void {
    const c = this.character;
    c.melee = null;
    c.movement_locked = false;
    // Hand the sprite back to whatever locomotion is running now.
    const loco = c.currentLocomotion();
    if (loco instanceof Ability) loco.play_animation_on_initialize();
  }

  /** Which swing a fresh press starts, in the reference's order of checks. */
  private pick(): StepKey {
    const c = this.character;
    if (c.is_on_floor() && c.is_executing("Dash")) return "dashSlash";
    if (c.is_executing("WallSlide")) return "wallSlash";
    if (!c.is_on_floor()) return "jumpSlash";
    return "slash1";
  }

  private get current(): SlashStep {
    return this.config[this.step];
  }

  private begin(step: StepKey): void {
    const c = this.character;
    this.step = step;
    this.frame = 0;
    this.clipFrame = 0;
    c.melee = null;
    c.movement_locked = GROUNDED.has(step);
    if (c.movement_locked) {
      // A dash slash replaces the dash outright, as in the reference.
      c.get_executing_ability("Dash")?.EndAbility();
      c.set_horizontal_speed(0);
    }
    c.play_animation(this.current.animation);
    c.events.emit("slash", step); // one per swing, chained or not: the swing sound
  }
}
