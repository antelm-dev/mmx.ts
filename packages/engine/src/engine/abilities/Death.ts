import { Movement } from "../ability/Movement.js";
import type { Character } from "../Character.js";
import { PLAYER_DEATH_RESTART_DELAY } from "../../core/constants.js";

/**
 * X's death sequence — port of PlayerDeath.gd, trimmed to what this port's Stage
 * and Scene actually need: freeze in place, hide the sprite, let the death sound
 * play out, then hand off to a room restart. The white-fade backdrop and the
 * 16-shard particle burst are cosmetic embellishments left out rather than
 * half-ported — unlike an enemy's death burst (ScenePresenter.attachEnemy,
 * EnemyExplosion/EnemyDebris in renderer-pixi), nothing in this port's Stage or
 * Scene needs X's shards to be more than decorative, and PlayerDeath.gd's fade
 * has no equivalent machinery here at all.
 *
 * Highest-priority state in the game and, like Damage, event-driven rather than
 * polled: Character.emit_zero_health is the only thing that ever starts it, and
 * once it is running nothing outranks it to interrupt it back out.
 */
export class Death extends Movement {
  readonly name = "Death";
  priority = 200;

  restart_delay = PLAYER_DEATH_RESTART_DELAY;

  constructor(character: Character) {
    super(character);
    character.events.on("zero_health", () => {
      if (!this.executing) this.startDeath();
    });
  }

  private startDeath(): void {
    for (const move of [...this.character.executing_moves]) {
      if (move !== this) move.Interrupt(this.name);
    }
    this.ExecuteOnce();
  }

  /** Event-only, like Damage — the per-frame poll must never start this itself. */
  override _StartCondition(): boolean {
    return false;
  }

  override _Setup(): void {
    this.character.stop_all_movement();
    this.character.listening_to_inputs = false;
    this.character.sprite_visible = false;
    // PlayerDeath.gd's disable_floor_snap: Damage's knockback lifts X a pixel off
    // the floor before Death freezes him, and the snap would otherwise quietly
    // pull him back down onto it over the next tick.
    this.character.floor_snap_enabled = false;
  }

  /** No gravity, no input: X hangs in the air exactly where he died. */
  override _Update(_dt: number): void {}

  override _EndCondition(): boolean {
    return this.timer > this.restart_delay;
  }

  /** PlayerDeath's GameManager.on_death() hand-off — main.ts restarts the room on it. */
  override _Interrupt(): void {
    this.character.events.emit("death");
  }
}
