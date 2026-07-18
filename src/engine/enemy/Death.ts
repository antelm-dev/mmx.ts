import { EnemyAbility } from './EnemyAbility.js';
import type { Enemy } from '../Enemy.js';

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
 */
export class Death extends EnemyAbility {
  readonly name = 'Death';

  explosion_duration = 0;

  constructor(enemy: Enemy) {
    super(enemy);
    this.conflicts = [];
    enemy.events.on('zero_health', () => {
      if (!this.executing) this.ExecuteOnce();
    });
  }

  /** EnemyDeath._StartCondition — nothing may ever start this but the signal. */
  override _StartCondition(): boolean {
    return false;
  }

  override _Setup(): void {
    this.character.stop_all_movement();
    this.character.exploding = true;
  }

  override _Update(_dt: number): void {
    if (this.timer > this.explosion_duration && this.character.exploding) {
      this.character.exploding = false;
      this.character.sprite_visible = false;
      this.character.events.emit('death');
    }
  }

  /** EnemyDeath._EndCondition — the node is freed a second after the blast. */
  override _EndCondition(): boolean {
    return this.timer > this.explosion_duration + 1;
  }

  /** EnemyDeath._Interrupt: `get_parent().queue_free()`. */
  override _Interrupt(): void {
    this.character.alive = false;
  }
}
