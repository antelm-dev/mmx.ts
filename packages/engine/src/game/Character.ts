import { AbilityUser } from "./AbilityUser.js";
import { World } from "./World.js";
import { Projectile } from "./Projectile.js";
import { Input, Action } from "../core/Input.js";
import { Rng } from "../core/Rng.js";
import {
  MAX_CHARGED_SHOTS_ALIVE,
  MAX_SHOTS_ALIVE,
  SHOT_POSITION,
  SHOT_POSITION_ADJUST,
  SUB_WEAPON_CONFIG,
  SUB_WEAPON_MAX_AMMO,
  WEAPON_ORDER,
  type WeaponId,
} from "../core/constants.js";

/**
 * Input + high-level player API — port of Character.gd (and the input-facing parts
 * of Player.gd). Owns the Input object and exposes the accessors the abilities call.
 */
export class Character extends AbilityUser {
  input: Input;
  listening_to_inputs = true;

  // Player.gd movement flags
  last_time_dashed = 0;
  dashfall = false;
  dashjumps_since_jump = 0;
  block_charging = false;

  projectiles: Projectile[] = [];

  /** WeaponChanger.gd's selection — the buster (slot 0) until the player cycles. */
  activeWeapon: WeaponId = WEAPON_ORDER[0];
  /**
   * BossWeapon.gd's `current_ammo` per sub-weapon slot. The buster has no entry:
   * Weapon.gd:has_ammo() is unconditionally true, i.e. infinite.
   */
  private readonly subWeaponAmmo = new Map<WeaponId, number>(
    Object.keys(SUB_WEAPON_CONFIG).map((id) => [id as WeaponId, SUB_WEAPON_MAX_AMMO]),
  );

  /** Death hides the sprite once the sequence starts (mirrors Enemy.sprite_visible). */
  sprite_visible = true;
  /** Set once zero health is reached, so the death hand-off only fires once. */
  private zero_health_emitted = false;

  /**
   * Owned, seeded randomness for the cosmetic rolls the original takes with the
   * global `randf` (spawn jitter, lemon start frame, particle flip). Seeding it
   * per character is what keeps the headless sim and the tests reproducible.
   */
  rng: Rng;

  constructor(world: World, x: number, y: number, input: Input, seed?: number) {
    super(world, x, y);
    this.input = input;
    this.rng = new Rng(seed);
    this.events.on("land", () => this.on_land());
  }

  /**
   * Muzzle position in world space — Character.gd's "Shot Position" node plus the
   * adjustments the currently-running abilities contribute (Ability.gd:176). X's
   * cannon is not in a fixed spot: dashing pushes it forward and down, falling
   * pulls it up, so the shot leaves from wherever the pose actually puts it.
   */
  get_shot_position(): { x: number; y: number } {
    let ox = SHOT_POSITION.x;
    let oy = SHOT_POSITION.y;
    for (const move of this.executing_moves) {
      const adjust = SHOT_POSITION_ADJUST[move.name];
      if (adjust) {
        ox += adjust.x;
        oy += adjust.y;
      }
    }
    const dir = this.get_facing_direction();
    return { x: this.pos.x + ox * dir, y: this.pos.y + oy };
  }

  /**
   * Weapon.gd:can_shoot — the buster refuses to fire while its shots are already
   * on screen. That cap is the whole reason buster fire has a rhythm instead of
   * being a hose: three lemons out means you wait for one to land or fly off.
   * Spent shots (still playing their hit particle) do not count against it.
   */
  can_shoot(charge: number): boolean {
    const cap = charge > 0 ? MAX_CHARGED_SHOTS_ALIVE : MAX_SHOTS_ALIVE;
    // Filtered by weapon as well as charge sign: a Dark Arrow shot still in
    // flight after switching back to the buster must not eat into its cap.
    const live = this.projectiles.filter(
      (p) => p.isLive && p.weapon === "buster" && p.charge > 0 === charge > 0,
    ).length;
    return live < cap;
  }

  /** Spawn a buster shot from the cannon (Shot/Charge -> Weapon.fire). */
  spawnBuster(charge: number): void {
    if (!this.can_shoot(charge)) return;
    const muzzle = this.get_shot_position();
    const dir = this.get_facing_direction();
    this.projectiles.push(new Projectile(muzzle.x, muzzle.y, dir, charge, this.rng));
    this.events.emit("shot_fired", charge);
  }

  /**
   * BossWeapon.gd:can_shoot / has_ammo, dispatched onto whichever weapon is
   * active — what {@link Shot}'s `_StartCondition` actually gates fire on. The
   * buster keeps its own unlimited-ammo/shots-alive check via {@link can_shoot};
   * every other slot is gated on its {@link SUB_WEAPON_CONFIG} entry instead.
   */
  canFireActiveWeapon(charge: number): boolean {
    if (this.activeWeapon === "buster") return this.can_shoot(charge);
    const config = SUB_WEAPON_CONFIG[this.activeWeapon];
    if (!config) return false;
    const ammo = this.subWeaponAmmo.get(this.activeWeapon) ?? 0;
    if (ammo < config.ammoCost) return false;
    const live = this.projectiles.filter(
      (p) => p.isLive && p.weapon === this.activeWeapon,
    ).length;
    return live < config.maxShotsAlive;
  }

  /**
   * BossWeapon.fire, dispatched the same way as {@link canFireActiveWeapon}.
   * `charge` is only meaningful for the buster — every ported sub-weapon slot
   * fires its single regular shot regardless (see {@link WEAPON_SHOTS}), since
   * no sub-weapon's charged tier is ported yet.
   */
  fireActiveWeapon(charge: number): void {
    if (this.activeWeapon === "buster") {
      this.spawnBuster(charge);
      return;
    }
    if (!this.canFireActiveWeapon(charge)) return;
    const config = SUB_WEAPON_CONFIG[this.activeWeapon];
    if (!config) return;
    const muzzle = this.get_shot_position();
    const dir = this.get_facing_direction();
    this.projectiles.push(new Projectile(muzzle.x, muzzle.y, dir, 0, this.rng, this.activeWeapon));
    const ammo = this.subWeaponAmmo.get(this.activeWeapon) ?? 0;
    this.subWeaponAmmo.set(this.activeWeapon, Math.max(0, ammo - config.ammoCost));
    this.events.emit("shot_fired", 0);
  }

  /**
   * Current ammo in a weapon's tank — Infinity for the buster, which tracks
   * none (see {@link canFireActiveWeapon}). Read by {@link WeaponCapsule} to
   * know when a tank is already full, and by the HUD's weapon bar.
   */
  getWeaponAmmo(weapon: WeaponId): number {
    if (weapon === "buster") return Infinity;
    return this.subWeaponAmmo.get(weapon) ?? 0;
  }

  /**
   * AmmoPickup.gd:do_ammo — raise the *active* weapon's ammo, clamped to
   * {@link SUB_WEAPON_MAX_AMMO}, mirroring Actor.heal's clamp-and-report shape.
   * A no-op on the buster, which has nothing to refill.
   */
  refillWeaponAmmo(value: number): void {
    if (this.activeWeapon === "buster") return;
    const before = this.subWeaponAmmo.get(this.activeWeapon) ?? 0;
    const after = Math.min(SUB_WEAPON_MAX_AMMO, before + value);
    if (after > before) {
      this.subWeaponAmmo.set(this.activeWeapon, after);
      this.events.emit("weapon_ammo_refilled", after - before);
    }
  }

  /**
   * WeaponChanger.gd — cycle the active weapon on weapon_left/weapon_right, or
   * jump straight back to the buster (slot 0) when the player taps one
   * direction while still holding the other, a panic button rather than one
   * more step around the list.
   */
  private updateWeaponSwitch(): void {
    const leftPressed = this.get_action_just_pressed("weapon_left");
    const rightPressed = this.get_action_just_pressed("weapon_right");
    if (!leftPressed && !rightPressed) return;

    const leftHeld = this.get_action_pressed("weapon_left");
    const rightHeld = this.get_action_pressed("weapon_right");
    if ((leftHeld && rightPressed) || (rightHeld && leftPressed)) {
      this.setActiveWeapon(WEAPON_ORDER[0]);
      return;
    }
    const current = WEAPON_ORDER.indexOf(this.activeWeapon);
    const delta = rightPressed ? 1 : -1;
    this.setActiveWeapon(WEAPON_ORDER[(current + delta + WEAPON_ORDER.length) % WEAPON_ORDER.length]);
  }

  private setActiveWeapon(weapon: WeaponId): void {
    if (weapon === this.activeWeapon) return;
    this.activeWeapon = weapon;
    this.events.emit("weapon_changed", weapon);
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) p.update(dt, this.world);
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  // --- input gating (Character.get_action_*) ---
  get_action_pressed(a: Action): boolean {
    return this.listening_to_inputs && this.input.isPressed(a);
  }
  get_action_just_pressed(a: Action): boolean {
    return this.listening_to_inputs && this.input.justPressed(a);
  }
  get_action_just_released(a: Action): boolean {
    return this.listening_to_inputs && this.input.justReleased(a);
  }
  get_pressed_axis(): number {
    if (!this.listening_to_inputs) return 0;
    return this.input.axis();
  }
  has_just_pressed_left(): boolean {
    return this.get_action_just_pressed("move_left");
  }
  has_just_pressed_right(): boolean {
    return this.get_action_just_pressed("move_right");
  }

  // --- Player.gd helpers used by abilities ---
  on_land(): void {
    this.dashjumps_since_jump = 0;
    this.dashfall = false;
  }
  start_dashfall(): void {
    if (!this.is_on_floor()) this.dashfall = true;
  }
  dashjump_signal(): void {
    this.events.emit("dashjump");
    this.dashjumps_since_jump += 1;
  }
  airdash_signal(): void {
    this.events.emit("airdash");
  }

  /** Character.gd's zero-health hand-off — port of Enemy.emit_zero_health, fires once. */
  emit_zero_health(): void {
    if (this.zero_health_emitted) return;
    this.zero_health_emitted = true;
    this.current_health = 0;
    this.events.emit("zero_health");
  }

  // low walljump raycast toggles — cosmetic no-ops in this port
  activate_low_walljump_raycasts(): void {}
  deactivate_low_walljump_raycasts(): void {}
  are_low_walljump_raycasts_active(): boolean {
    return true;
  }

  // ---------------------------------------------------------------------------
  // Main physics tick — mirrors the intended Godot frame order:
  //   abilities set velocity -> integrate/collide -> post checks -> advance input edges
  // ---------------------------------------------------------------------------
  tick(dt: number): void {
    if (this.invulnerability > 0) this.invulnerability -= dt;
    this.clockMs += dt * 1000;

    // Character.check_for_dash — publish a dash press for DashJump timing.
    if (this.get_action_just_pressed("dash")) {
      this.last_time_dashed = this.clockMs;
      this.events.emit("input_dash");
    }
    this.updateWeaponSwitch();

    this.stepAbilities(dt);
    this.physicsStep(dt);
    this.updateProjectiles(dt);
    // Sprite last: abilities have set the clip for this frame, and any
    // `animation_finished` handoff (walk_start -> walk, recover -> idle) lands on
    // an already-settled state.
    this.stepAnimation(dt);
    this.input.newFrame();
  }
}
