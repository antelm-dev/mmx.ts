import { Movement } from '../ability/Movement.js';

/** Port of Idle.gd — grounded, no input. */
export class Idle extends Movement {
  readonly name = 'Idle';
  priority = 0;

  override _StartCondition(): boolean {
    return this.character.is_on_floor();
  }

  override _Setup(): void {
    this.character.set_horizontal_speed(0);
    this.play_animation('idle');
  }

  override _Update(_dt: number): void {
    this.character.set_direction(this.get_pressed_direction());
    this.update_bonus_horizontal_only_conveyor();
  }

  override _EndCondition(): boolean {
    return !this.character.is_on_floor();
  }
}
