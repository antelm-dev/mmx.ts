import { Movement } from '../ability/Movement.js';
import { WALLSLIDE_SPEED, WALLSLIDE_START_DELAY } from '../../core/constants.js';

/**
 * Port of Wallslide.gd — cling to a wall while pressing into it, then slide.
 * A short block_timer prevents immediately re-gripping right after leaving.
 */
export class WallSlide extends Movement {
  readonly name = 'WallSlide';
  priority = 3;

  start_delay = WALLSLIDE_START_DELAY;
  block_timer = 0;
  private slide_speed = WALLSLIDE_SPEED;
  private wallgrab_direction = 0;

  override should_execute_on_hold(): boolean {
    return true;
  }

  override _StartCondition(): boolean {
    const c = this.character;
    if (!c.is_on_floor() && !(this.block_timer > 0)) {
      if (
        c.is_colliding_with_wall() !== 0 &&
        c.get_vertical_speed() > 0 &&
        this.get_pressed_direction() === c.is_colliding_with_wall()
      ) {
        return true;
      }
    }
    return false;
  }

  override _Setup(): void {
    this.character.events.emit('wallslide');
    this.character.set_direction(-this.get_pressed_direction());
    this.wallgrab_direction = this.get_pressed_direction();
    this.play_animation('wallslide');
  }

  override _Update(_dt: number): void {
    this.character.set_horizontal_speed(this.slide_speed * this.wallgrab_direction);
    if (this.delay_has_expired()) {
      this.character.set_vertical_speed(this.slide_speed); // sliding down
    } else {
      this.character.set_vertical_speed(0); // gripping (minor tuning vs source)
    }
  }

  private delay_has_expired(): boolean {
    return this.timer > this.start_delay;
  }

  override _EndCondition(): boolean {
    const c = this.character;
    if (c.is_on_floor()) return true;
    if (!c.is_in_reach_for_walljump()) {
      this.block_timer = 0.01;
      return true;
    }
    if (this.get_pressed_direction() !== c.is_in_reach_for_walljump()) return true;
    if (this.get_pressed_direction() === 0) return true;
    return false;
  }

  override _Interrupt(): void {
    if (this.character.get_vertical_speed() > 0) this.character.set_vertical_speed(40);
    this.character.set_horizontal_speed(0);
  }

  // Runs every frame regardless of executing state (Wallslide.gd:_physics_process).
  override alwaysTick(dt: number): void {
    if (this.block_timer > 0) {
      this.block_timer += dt;
      if (this.block_timer > 0.15) this.block_timer = 0;
    }
  }
}
