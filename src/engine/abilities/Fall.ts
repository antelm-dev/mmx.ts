import { Movement } from '../ability/Movement.js';
import { DASHFALL_SPEED } from '../../core/constants.js';

/** Port of Fall.gd — airborne, gravity + air control. */
export class Fall extends Movement {
  readonly name: string = 'Fall';
  priority = 1;
  override animation = 'fall'; // Fall.tscn

  override _StartCondition(): boolean {
    return !this.character.is_on_floor();
  }

  /**
   * Fall.gd:play_animation_on_initialize — only start the clip if it isn't already
   * running, so the handoff from Jump (which ends at the apex already showing
   * `fall`) continues the descent instead of snapping back to its first frame.
   */
  override play_animation_on_initialize(): void {
    if (this.animation && this.character.get_animation() !== this.animation) {
      this.play_animation(this.animation);
    }
  }

  override _Setup(): void {
    this.changed_animation = false;
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
