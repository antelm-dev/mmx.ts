import { Movement } from '../ability/Movement.js';
import { DASHFALL_SPEED } from '../../core/constants.js';

/** Port of Fall.gd — airborne, gravity + air control. */
export class Fall extends Movement {
  readonly name: string = 'Fall';
  priority = 1;

  override _StartCondition(): boolean {
    return !this.character.is_on_floor();
  }

  override _Setup(): void {
    this.changed_animation = false;
    this.play_animation('fall');
  }

  override _Update(dt: number): void {
    this.process_gravity(dt);
    this.change_animation_if_falling('fall');
    this.zero_bonus_horizontal_speed();
    if (this.character.dashfall) {
      this.set_movement_and_direction(DASHFALL_SPEED);
    } else {
      this.set_movement_and_direction(this.horizontal_velocity);
    }
  }

  override _Interrupt(): void {
    this.character.dashfall = false;
    super._Interrupt();
  }

  override _EndCondition(): boolean {
    return this.character.is_on_floor();
  }
}
