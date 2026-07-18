import { EnemyAbility } from './EnemyAbility.js';
import { PATROL_SPEED, PATROL_TRAVEL_TIME } from '../../core/constants.js';
import type { Enemy } from '../Enemy.js';

/**
 * Walk one leg, then rest — port of CrabPatrol.gd, which the Metool's scene
 * reuses for its Patrol node.
 *
 * The ability only ever performs a single out-and-stop; the endless pacing comes
 * from the AI restarting it the moment nothing is executing (AI.handle_idle_ability_calls),
 * and from `_Setup` turning around each time. That indirection is why a Metool
 * paces without any ability tracking where it started or how far it has gone.
 */
export class Patrol extends EnemyAbility {
  readonly name = 'Patrol';

  /** Metool.tscn: random_turn = false, so it simply reverses each leg. */
  random_turn = false;
  travel_time = PATROL_TRAVEL_TIME;
  travel_speed = PATROL_SPEED;

  /**
   * CrabPatrol.random_rest_time overwrites the scene's `rest_time` on every
   * setup, so the exported 2.0 on Metool.tscn never actually takes effect — the
   * rest is always 0.8-1.8s. Ported as written, because two Metools placed side
   * by side falling out of step is the visible consequence.
   */
  private rest_time = 0.8;

  constructor(enemy: Enemy) {
    super(enemy);
    this.animation = 'walk';
    this.conflicts = ['Hide', 'Stun'];
  }

  override _Setup(): void {
    if (this.random_turn) {
      this.set_direction(this.character.rng.next() < 0.5 ? -1 : 1);
    } else {
      this.turn();
    }
    this.rest_time = 0.8 + this.character.rng.next();
  }

  override _Update(dt: number): void {
    this.process_gravity(dt);

    if (this.attack_stage === 0) {
      // Tools.timer(0.05, "move") — the turn lands a beat before the walk does.
      if (this.timer > 0.05) this.force_movement(this.travel_speed);

      // The wall probe reaches 13px out from the centre, wider than the 12px
      // body, so the turn happens just before contact rather than after the
      // sweep has already stopped the walk dead against the tile.
      if (this.character.wall_ahead(13, 0) === this.character.get_direction()) {
        this.turn();
        this.force_movement(this.travel_speed);
      }

      if (this.timer > this.travel_time) {
        this.force_movement(0);
        this.play_animation('idle');
        this.next_attack_stage();
      }
      return;
    }

    if (this.attack_stage === 1 && this.timer > this.rest_time) this.EndAbility();
  }
}
