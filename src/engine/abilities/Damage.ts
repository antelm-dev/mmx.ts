import { Movement } from '../ability/Movement.js';
import type { Actor } from '../Actor.js';
import type { Character } from '../Character.js';
import {
  PLAYER_DAMAGE_DURATION,
  PLAYER_DAMAGE_INVULNERABILITY,
  PLAYER_KNOCKBACK_JUMP_VELOCITY,
  PLAYER_KNOCKBACK_SPEED,
} from '../../core/constants.js';

/**
 * Player hurt/knockback — port of Damage.gd and Player.tscn's Damage node.
 *
 * Damage is signal-started in the original rather than input-started. A landed hit
 * therefore calls {@link receiveHit} directly; as a high-priority state it stops
 * every running move immediately, including the independent buster/charge layer.
 */
export class Damage extends Movement {
  readonly name = 'Damage';
  priority = 100;
  override animation = 'damage';

  duration_time = PLAYER_DAMAGE_DURATION;
  invulnerability_time = PLAYER_DAMAGE_INVULNERABILITY;
  damage_reduction = 0;
  death_protection = 1;

  damage_taken = 0;
  damage_direction = -1;

  constructor(character: Character) {
    super(character);
    this.horizontal_velocity = PLAYER_KNOCKBACK_SPEED;
    this.jump_velocity = PLAYER_KNOCKBACK_JUMP_VELOCITY;
  }

  /** Damage is event-driven; the regular per-frame ability poll must never start it. */
  override _StartCondition(): boolean {
    return false;
  }

  receiveHit(value: number, inflicter?: Actor): boolean {
    if (!this.should_be_damaged()) return false;

    this.damage_taken = value;
    this.damage_direction = this.define_knockback_direction(inflicter);

    // Damage.gd is_high_priority() returns true, so the source interrupts every
    // currently executing move except explicit "Nothing" states. This port has no
    // such protected player state, therefore all active movement/action layers end.
    for (const move of [...this.character.executing_moves]) {
      if (move !== this) move.Interrupt(this.name);
    }
    this.ExecuteOnce();
    return true;
  }

  override _Setup(): void {
    this.reduce_health();
    this.character.invulnerability = this.invulnerability_time;
    this.character.set_direction(-this.damage_direction); // face the attacker
    this.character.update_facing_direction();
    this.character.set_vertical_speed(-this.jump_velocity);
    this.zero_bonus_horizontal_speed();
    // Damage.gd lifts X one pixel before the launch so floor snap cannot pin him.
    this.character.pos.y -= 1;
    this.character.events.emit('received_damage', this.damage_taken);
  }

  override _Update(dt: number): void {
    // Knockback direction is fixed by the inflicter, never by held input or facing.
    this.character.set_horizontal_speed(this.horizontal_velocity * this.damage_direction);
    this.process_gravity(dt);
  }

  override _EndCondition(): boolean {
    if (this.timer > this.duration_time) return true;

    // Damage.gd lets a fresh press into the wall cancel the tumble.
    const wall = this.character.is_colliding_with_wall();
    const justPressed = this.character.has_just_pressed_right()
      ? 1
      : this.character.has_just_pressed_left()
        ? -1
        : 0;
    if (wall !== 0 && justPressed === wall) {
      this.character.set_vertical_speed(0);
      return true;
    }
    return false;
  }

  /** Preserve vertical momentum for the Fall handoff, matching Damage.gd. */
  override _Interrupt(): void {
    this.character.set_horizontal_speed(0);
  }

  private should_be_damaged(): boolean {
    return (
      this.active &&
      this.character.listening_to_inputs &&
      this.character.has_health() &&
      !this.character.is_invulnerable()
    );
  }

  private define_knockback_direction(inflicter?: Actor): number {
    if (inflicter && this.character.pos.x - inflicter.pos.x > 0) return 1;
    return -1;
  }

  private reduce_health(): void {
    const actual = Math.round(this.damage_taken * (1 - this.damage_reduction / 100));
    if (
      this.character.current_health > 3 &&
      this.death_protection > 0 &&
      this.character.current_health - actual <= 0
    ) {
      const reduced = this.character.current_health - 1;
      this.character.current_health = 1;
      this.death_protection = 0;
      this.character.events.emit('reduced_health', reduced);
      return;
    }

    this.character.current_health -= actual;
    this.character.events.emit('reduced_health', actual);
  }
}
