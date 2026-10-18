import { Ability } from "../ability/Ability.js";
import { Shot } from "./Shot.js";
import type { Character, PlayerWeapon } from "../Character.js";
import { AnimationCursor, uniformClip } from "../../core/AnimationCursor.js";
import { CHARGE_FX_FRAME_COUNT, CHARGE_FX_LIFETIME, ChargeTier } from "../../core/constants.js";

const CHARGE_ANIMATION = uniformClip(
  CHARGE_FX_FRAME_COUNT,
  CHARGE_FX_FRAME_COUNT / CHARGE_FX_LIFETIME,
  true,
);

/** Typed charge thresholds for {@link Charge}, supplied by the loadout (Part 5). */
export interface ChargeConfig {
  minTime: number;
  level3: number;
  level4: number;
  maxTime: number;
}

/**
 * Port of Charge.gd (buster) — holding fire accumulates charge; releasing above
 * the minimum threshold fires a charged shot whose level depends on hold time.
 * Independent action layer; coexists with Shot (tap = lemon, hold+release = charge).
 */
export class Charge extends Ability {
  readonly name = "Charge";
  override independent = true;
  charged_time = 0;

  /** Charge thresholds (seconds) — Charge.gd's minimum/level_3/level_4/maximum. */
  private readonly min_time: number;
  private readonly level_3: number;
  private readonly level_4: number;
  private readonly max_time: number;

  /** The weapon being charged, latched at the start so a mid-hold switch fires it still. */
  private weapon: PlayerWeapon | undefined;

  /** VFX latches — Charge.gd's `charging` / `mid_charge` / `max_charge`. */
  charging = false;
  mid_charge = false;
  max_charge = false;

  private readonly vfxAnimation = new AnimationCursor();

  constructor(character: Character, config: ChargeConfig) {
    super(character);
    this.actions = ["fire"];
    this.min_time = config.minTime;
    this.level_3 = config.level3;
    this.level_4 = config.level4;
    this.max_time = config.maxTime;
    this.vfxAnimation.play(CHARGE_ANIMATION);
  }

  override should_execute_on_hold(): boolean {
    return true;
  }

  /** Only a weapon with a charged tier charges (no ported sub-weapon has one). */
  override _StartCondition(): boolean {
    const weapon = this.character.getWeapon(this.character.activeWeapon);
    return (
      !this.character.is_executing_either(["Damage", "Slash"]) &&
      this.character.get_action_pressed("fire") &&
      !this.character.block_charging &&
      weapon !== undefined &&
      weapon.shots.length > 1
    );
  }

  override _Setup(): void {
    this.weapon = this.character.getWeapon(this.character.activeWeapon);
    this.charged_time = 0;
    this.charging = false;
    this.mid_charge = false;
  }

  override _Update(dt: number): void {
    if (this.character.get_action_pressed("fire")) {
      this.charge(dt);
    } else {
      if (this.charged_time > this.min_time) {
        this.character.fireWeapon(this.weapon, this.get_charge_level());
        // Charge owns the projectile but not the pose — Shot does. Without this
        // the charged shot leaves the cannon while X is still standing neutral,
        // since the initial tap's arm-point window expired during the hold.
        const shot = this.character.get_ability("Shot");
        if (shot instanceof Shot) shot.arm_point();
      }
      this.EndAbility();
    }
  }

  /**
   * Charge.gd:charge — accumulate, and announce the two thresholds as they are
   * crossed. The original drives sound, a shader tint and three particle sprites
   * off these; here they are events so the renderer can do the same without the
   * engine knowing anything about drawing.
   */
  private charge(dt: number): void {
    if (this.charged_time < this.max_time) this.charged_time += dt;
    if (this.charging) this.vfxAnimation.advance(dt);

    if (this.charged_time > this.min_time && !this.charging) {
      this.charging = true;
      this.vfxAnimation.seek(0);
      this.character.events.emit("charge_started");
    }
    if (this.get_charge_level() > 1 && !this.mid_charge) {
      this.mid_charge = true;
      this.character.events.emit("charge_mid");
    }
    // The level-4 threshold no longer selects a projectile, but it still marks
    // where the original switches to the super-charge tint and particle.
    if (this.charged_time > this.level_4 && !this.max_charge) {
      this.max_charge = true;
      this.character.events.emit("charge_max");
    }
  }

  /**
   * Charge.gd:get_charge_level. Level 3 exists only for an upgraded arm cannon,
   * which this port does not model — and the buster's `shots` array has no fourth
   * projectile anyway, so it would clamp straight back onto the charged shot.
   */
  get_charge_level(): number {
    if (this.charged_time < this.min_time) return 0;
    if (this.charged_time < this.level_3) return 1;
    return 2;
  }

  /**
   * Which aura to show right now. Nothing is drawn below the minimum hold: the
   * charge only becomes visible once it is actually worth releasing, which is
   * what makes the aura a usable signal rather than decoration.
   */
  get vfx_tier(): ChargeTier {
    if (!this.executing || !this.charging) return ChargeTier.None;
    if (this.max_charge) return ChargeTier.Super;
    if (this.mid_charge) return ChargeTier.Charged;
    return ChargeTier.Charging;
  }

  /** Frame of the aura loop — 16 frames per 0.3s emitter lifetime, repeating. */
  get vfx_frame(): number {
    return this.vfxAnimation.frame;
  }

  override _EndCondition(): boolean {
    if (this.charged_time === 0 && this.timer > 0.1) return true;
    return false;
  }

  /** Charge.gd:_Interrupt -> stop_vfx — drop the charge and clear every latch. */
  override _Interrupt(): void {
    this.charged_time = 0;
    if (this.charging || this.mid_charge || this.max_charge) {
      this.character.events.emit("charge_stopped");
    }
    this.charging = false;
    this.mid_charge = false;
    this.max_charge = false;
    this.vfxAnimation.seek(0);
  }
}

export type ChargeVfx = Pick<Charge, "vfx_tier" | "vfx_frame">;
