import { EnemyAbility } from "./EnemyAbility.js";
import type { Enemy } from "../Enemy.js";

/** Typed tuning for {@link Death} (an enemy's `abilityConfig.Death`). */
export interface DeathConfig {
  explosionDuration: number;
  /** Health at or below which the weak phase starts; 0 or absent never starts it. */
  weakHealth?: number;
  /** Clip the weak phase plays; absent or "" keeps the current one. */
  weakAnimation?: string;
  /** Seconds the weak phase lasts before the enemy self-destructs. */
  weakDuration?: number;
}

/**
 * Death sequence — port of EnemyDeath.gd.
 *
 * Not `alive = false`, for the same reason a spent projectile is not simply
 * deleted: the explosion has to play somewhere. EnemyDeath keeps the node alive
 * for `explosion_duration` while particles emit, hides the sprite, and only frees
 * it a second later. Both scenes here set the duration to 0 (Metool.tscn
 * explosion_duration = 0.0, and the bat uses the QuickEnemyDeath scene), so the
 * sprite goes at once and the corpse is reaped a second afterwards.
 *
 * Started by the enemy's own `zero_health` signal rather than by the AI: that is
 * EnemyDeath._on_zero_health, and it is what makes death independent of whether
 * the AI happens to be active — the AI has in fact just switched itself off.
 *
 * Optionally preceded by a weak phase (no Godot counterpart — MMX1's Spiky,
 * which tips over when nearly spent and then blows itself up). A hit
 * that leaves health at or below `weakHealth` switches the AI off, stops the
 * enemy where it is (gravity still pulls) and plays `weakAnimation`; after
 * `weakDuration` the enemy zeroes its own health, so the blast comes through the
 * same `zero_health` hand-off as a killing shot — which may also arrive first.
 *
 * The weak enemy still hurts on contact: Stage spares only a corpse or a blast,
 * and in X1 a downed Spiky is still a body in the way, not scenery.
 */
export class Death extends EnemyAbility {
  readonly name = "Death";

  explosion_duration: number;
  weak_health: number;
  weak_animation: string;
  weak_duration: number;
  /** True while the weak phase runs, i.e. before zero health hands over to the blast. */
  weak = false;

  constructor(enemy: Enemy, config: DeathConfig) {
    super(enemy);
    this.explosion_duration = config.explosionDuration;
    this.weak_health = config.weakHealth ?? 0;
    this.weak_animation = config.weakAnimation ?? "";
    this.weak_duration = config.weakDuration ?? 0;
    this.conflicts = [];
    enemy.events.on("zero_health", () => {
      if (!this.executing) this.ExecuteOnce();
    });
    // `got_hit` fires only while health is left, and after the AI's own reaction
    // to it, so the weak phase interrupts that reaction rather than racing it.
    // Once executing, Death only ends at zero health: the phase starts once.
    enemy.events.on("got_hit", () => {
      if (this.weak_health > 0 && !this.executing && enemy.current_health <= this.weak_health) {
        this.weak = true;
        enemy.ai.deactivate();
        this.ExecuteOnce();
      }
    });
  }

  /** EnemyDeath._StartCondition — nothing may ever start this but the signal. */
  override _StartCondition(): boolean {
    return false;
  }

  override _Setup(): void {
    if (this.weak) {
      this.character.set_horizontal_speed(0);
      if (this.character.stats.flying) this.character.set_vertical_speed(0, false);
      // A raised guard would make the weak enemy unkillable until it blows itself up.
      this.character.deactivate_shield();
      if (this.weak_animation !== "") this.play_animation(this.weak_animation);
      return;
    }
    this.character.stop_all_movement();
    this.character.exploding = true;
  }

  override _Update(dt: number): void {
    if (this.weak) {
      if (!this.character.stats.flying) this.process_gravity(dt);
      if (this.timer > this.weak_duration) this.character.emit_zero_health();
      return;
    }
    if (this.timer > this.explosion_duration && this.character.exploding) {
      this.character.exploding = false;
      this.character.sprite_visible = false;
      this.character.events.emit("death");
    }
  }

  /** EnemyDeath._EndCondition — the node is freed a second after the blast. */
  override _EndCondition(): boolean {
    return !this.weak && this.timer > this.explosion_duration + 1;
  }

  /**
   * EnemyDeath._Interrupt: `get_parent().queue_free()`. Zero health ends the weak
   * phase the way it ends any move, and the blast it starts frees the node.
   */
  override _Interrupt(): void {
    if (this.weak) this.weak = false;
    else this.character.alive = false;
  }
}
