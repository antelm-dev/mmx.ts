import { Movement } from '../ability/Movement.js';
import type { Character } from '../Character.js';

/**
 * Port of Idle.gd + IdleWeak.gd (the script actually attached in Idle.tscn).
 *
 * The standing state does not start on the `idle` clip: Idle.tscn exports
 * animation = "recover", the short pose where X lowers his arm, and IdleWeak swaps
 * to `idle` (or `weak` at low health) once that clip finishes. Raising or lowering
 * the buster while standing replays `recover` from frame 0, which is what makes
 * shooting on the spot look like a real arm movement rather than a pose swap.
 */
export class Idle extends Movement {
  readonly name = 'Idle';
  priority = 0;
  override animation = 'recover'; // Idle.tscn

  constructor(character: Character) {
    super(character);
    character.events.on('shot_layer_enabled', () => this.recover());
    character.events.on('shot_layer_disabled', () => this.recover());
    character.events.on('animation_finished', () => this.onAnimationFinished());
  }

  override _StartCondition(): boolean {
    return this.character.is_on_floor();
  }

  override _Setup(): void {
    this.character.set_horizontal_speed(0);
  }

  override _Update(_dt: number): void {
    this.character.set_direction(this.get_pressed_direction());
    this.update_bonus_horizontal_only_conveyor();
  }

  override _EndCondition(): boolean {
    return !this.character.is_on_floor();
  }

  /** Idle.gd:recover — replay the arm-movement clip when the buster goes in or out. */
  private recover(): void {
    if (this.executing) this.play_animation('recover');
  }

  /** IdleWeak.gd:_on_animatedSprite_animation_finished — settle into the stance. */
  private onAnimationFinished(): void {
    if (!this.executing) return;
    if (this.is_shooting()) return; // keep the arm out while the buster is up
    if (this.character.get_animation() !== 'recover') return;
    this.play_animation(this.character.is_low_health() ? 'weak' : 'idle');
  }

  private is_shooting(): boolean {
    return this.character.get_animation_layer() === 'pointing_cannon';
  }
}
