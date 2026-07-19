import type { Actor } from "./Actor.js";
import type { Character } from "./Character.js";
import { AnimationPlayer, type AnimData, type Region } from "./Animation.js";
import type { EnvironmentRect } from "./Environment.js";
import type { World } from "./World.js";
import {
  LIFE_CAPSULE_STATS,
  PICKUP_GRAVITY,
  PICKUP_TICK_INTERVAL,
  SUB_WEAPON_MAX_AMMO,
  WEAPON_CAPSULE_STATS,
} from "../core/constants.js";

/**
 * PickUp.process_gravity + process_movement — a plain vertical fall (the
 * spawner in the source only ever launches a capsule straight up, never
 * sideways, so there is no horizontal component to port). Resolved against the
 * tile world exactly like Actor's sweepY, so a capsule authored a few pixels
 * off the floor settles onto it instead of hanging in the air. Shared by every
 * PickUp.gd subclass — {@link LifeCapsule} and {@link WeaponCapsule} alike.
 */
function fallUnderGravity(
  box: { x: number; y: number; w: number; h: number },
  velocityY: number,
  dt: number,
  world: World,
): { y: number; velocityY: number } {
  const nextVelocityY = velocityY + PICKUP_GRAVITY * dt;
  const hw = box.w / 2;
  const hh = box.h / 2;
  const { pos, hit } = world.sweepY(box.x + hw, box.y + hh, hw, hh, nextVelocityY * dt);
  return { y: pos - hh, velocityY: hit ? 0 : nextVelocityY };
}

export type LifeCapsuleKind = "small" | "large";

export interface LifeCapsuleSpawn extends EnvironmentRect {
  kind: LifeCapsuleKind;
}

/**
 * Life Energy capsule — port of PickUp.gd (Heal.tscn / SmallHeal.tscn).
 *
 * Godot pauses the whole scene tree while a capsule's HP-bar-fill animation
 * plays (`GameManager.pause`, undone once `amount_to_heal` reaches 0). Stage
 * mirrors that by advancing only the collecting capsule until this effect is
 * complete. The capsule itself remains active, like Godot's PAUSE_MODE_PROCESS,
 * and ticks the same 1 HP / 0.06s rate as PickUp.do_heal().
 *
 * Overflow healing (do_heal's "amount_to_heal > 0 -> add_health_to_subtank"
 * branch) has nothing to redirect into without a sub-tank system — an
 * unported extension point per Player.ts — so it is simply discarded once the
 * player tops out, same as picking one up at full health wastes the rest of it.
 */
export class LifeCapsule implements EnvironmentRect {
  readonly id: string;
  readonly kind: LifeCapsuleKind;
  readonly x: number;
  y: number;
  readonly w: number;
  readonly h: number;
  readonly heal: number;

  /** PickUp.gd velocity.y — falls until process_gravity's move_and_slide lands it. */
  private velocityY = 0;

  private consuming = false;
  private remaining = 0;
  private timer = 0;
  /** True once fully drained (or discarded at full health) — the stage reaps it. */
  consumed = false;

  /** Godot's AnimatedSprite "idle" bob — optional, like Player/Enemy clip data. */
  private readonly anim = new AnimationPlayer();

  constructor(spawn: LifeCapsuleSpawn) {
    this.id = spawn.id;
    this.kind = spawn.kind;
    this.x = spawn.x;
    this.y = spawn.y;
    this.w = spawn.w;
    this.h = spawn.h;
    this.heal = LIFE_CAPSULE_STATS[spawn.kind].heal;
  }

  /** Whether the capsule has been touched and is currently ticking health in. */
  get collecting(): boolean {
    return this.consuming;
  }

  loadAnimations(data: AnimData): void {
    this.anim.load(data);
    this.anim.play("idle");
  }

  /** Atlas region for the current frame, or null with no clip data loaded. */
  currentRegion(): Region | null {
    return this.anim.currentRegion();
  }

  /** PickUp._on_area2D_body_entered — the player touched it; start the tick-heal. */
  beginConsuming(): void {
    if (this.consuming || this.consumed) return;
    this.consuming = true;
    this.remaining = this.heal;
    this.timer = 0;
  }

  /** PickUp.process_effect / do_heal, run once per tick after being touched. */
  tick(dt: number, player: Actor, world: World): void {
    this.anim.advance(dt);
    const fall = fallUnderGravity(this, this.velocityY, dt, world);
    this.y = fall.y;
    this.velocityY = fall.velocityY;
    if (!this.consuming) return;

    this.timer += dt;
    while (this.remaining > 0 && this.timer >= PICKUP_TICK_INTERVAL) {
      if (player.current_health >= player.max_health) {
        this.remaining = 0; // nothing left to redirect without a sub-tank
        break;
      }
      this.timer -= PICKUP_TICK_INTERVAL;
      player.heal(1);
      this.remaining--;
    }

    if (this.remaining <= 0) {
      this.consuming = false;
      this.consumed = true;
    }
  }
}

export type WeaponCapsuleKind = "small" | "large";

export interface WeaponCapsuleSpawn extends EnvironmentRect {
  kind: WeaponCapsuleKind;
}

/**
 * Weapon Energy capsule — port of AmmoPickup.gd (Ammo.tscn / SmallAmmo.tscn),
 * PickUp.gd's other direct subclass. It shares every mechanical beat with
 * {@link LifeCapsule} (falls under the same gravity, metered in at the same
 * 0.06s tick rate, freezes the room the same way while draining) — the only
 * real difference is *what* it fills: whichever sub-weapon the player has
 * equipped when it is touched (AmmoPickup.gd:
 * `player.get_node("Shot").current_weapon`), via {@link Character.refillWeaponAmmo}.
 *
 * Topping up the buster is a no-op there (Weapon.gd's own ammo counter is
 * untracked and unused — see can_shoot), so a capsule collected with the
 * buster equipped is simply spent for nothing, the same as the original.
 */
export class WeaponCapsule implements EnvironmentRect {
  readonly id: string;
  readonly kind: WeaponCapsuleKind;
  readonly x: number;
  y: number;
  readonly w: number;
  readonly h: number;
  readonly ammo: number;

  private velocityY = 0;

  private consuming = false;
  private remaining = 0;
  private timer = 0;
  consumed = false;

  private readonly anim = new AnimationPlayer();

  constructor(spawn: WeaponCapsuleSpawn) {
    this.id = spawn.id;
    this.kind = spawn.kind;
    this.x = spawn.x;
    this.y = spawn.y;
    this.w = spawn.w;
    this.h = spawn.h;
    this.ammo = WEAPON_CAPSULE_STATS[spawn.kind].ammo;
  }

  get collecting(): boolean {
    return this.consuming;
  }

  /**
   * Which sheet this capsule draws from — "ammo" or "sammo" in pickup_anims.json.
   * A separate key from {@link kind}: WeaponCapsuleKind ("small"/"large") is
   * already spent on LifeCapsule's own differently-sized sprites, so reusing
   * it to key the sheet table would collide with those.
   */
  get sheet(): "ammo" | "sammo" {
    return WEAPON_CAPSULE_STATS[this.kind].sheet;
  }

  loadAnimations(data: AnimData): void {
    this.anim.load(data);
    this.anim.play("idle");
  }

  currentRegion(): Region | null {
    return this.anim.currentRegion();
  }

  beginConsuming(): void {
    if (this.consuming || this.consumed) return;
    this.consuming = true;
    this.remaining = this.ammo;
    this.timer = 0;
  }

  /** AmmoPickup.process_effect / do_ammo, run once per tick after being touched. */
  tick(dt: number, player: Character, world: World): void {
    this.anim.advance(dt);
    const fall = fallUnderGravity(this, this.velocityY, dt, world);
    this.y = fall.y;
    this.velocityY = fall.velocityY;
    if (!this.consuming) return;

    this.timer += dt;
    while (this.remaining > 0 && this.timer >= PICKUP_TICK_INTERVAL) {
      if (player.getWeaponAmmo(player.activeWeapon) >= SUB_WEAPON_MAX_AMMO) {
        this.remaining = 0; // nothing left to redirect without an ammo reserve
        break;
      }
      this.timer -= PICKUP_TICK_INTERVAL;
      player.refillWeaponAmmo(1);
      this.remaining--;
    }

    if (this.remaining <= 0) {
      this.consuming = false;
      this.consumed = true;
    }
  }
}
