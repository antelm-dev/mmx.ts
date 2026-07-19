import type { Actor } from "./Actor.js";
import { AnimationPlayer, type AnimData, type Region } from "./Animation.js";
import type { EnvironmentRect } from "./Environment.js";
import { LIFE_CAPSULE_HEAL_TICK_INTERVAL, LIFE_CAPSULE_STATS } from "../core/constants.js";

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
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly heal: number;

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
  tick(dt: number, player: Actor): void {
    this.anim.advance(dt);
    if (!this.consuming) return;

    this.timer += dt;
    while (this.remaining > 0 && this.timer >= LIFE_CAPSULE_HEAL_TICK_INTERVAL) {
      if (player.current_health >= player.max_health) {
        this.remaining = 0; // nothing left to redirect without a sub-tank
        break;
      }
      this.timer -= LIFE_CAPSULE_HEAL_TICK_INTERVAL;
      player.heal(1);
      this.remaining--;
    }

    if (this.remaining <= 0) {
      this.consuming = false;
      this.consumed = true;
    }
  }
}
