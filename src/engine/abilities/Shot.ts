import { Ability } from '../ability/Ability.js';
import type { Character } from '../Character.js';
import { SHOT_ARM_POINT_DURATION } from '../../core/constants.js';

/**
 * Port of Shot.gd (buster only) — fires an uncharged "lemon" on each fire tap and
 * keeps the arm-point pose for a short window. Runs on the independent action
 * layer, concurrent with any movement state.
 *
 * Shooting deliberately plays *no* clip of its own. The original swaps the whole
 * SpriteFrames resource on the sprite (normal_sprites = x.res ->
 * arm_pointing_sprites = x_leftarm.res, "pointing_cannon"), keeping the current
 * clip name and frame index, so every state gets its arm-out twin — X keeps
 * walking, jumping, dashing or wall-sliding with the buster raised instead of
 * cutting to a standing shoot pose.
 */
export class Shot extends Ability {
  readonly name = 'Shot';
  override independent = true;
  private readonly arm_point_duration = SHOT_ARM_POINT_DURATION;
  private disabled_layer = true;

  constructor(character: Character) {
    super(character);
    this.actions = ['fire'];
  }

  override _StartCondition(): boolean {
    return true; // buster has infinite ammo
  }

  /** Shot.gd:play_animation_on_initialize — raise the buster, don't change clip. */
  override play_animation_on_initialize(): void {
    this.enable_animation_layer();
  }

  override _Setup(): void {
    this.fire();
  }

  override _Update(_dt: number): void {
    if (this.character.get_action_just_pressed('fire') && !this.is_initial_frame()) {
      this.fire();
    }
  }

  private fire(): void {
    this.enable_animation_layer();
    this.restart_animation();
    this.timer = 0;
    this.character.spawnBuster(0);
  }

  /** Shot.gd:restart_animation — firing mid-`recover` skips its first frame so a
   *  rapid tap re-raises the arm instead of restarting the whole lowering pose. */
  private restart_animation(): void {
    if (this.character.get_animation() === 'recover') {
      this.character.set_animation_frame(1);
    }
  }

  /** Shot.gd:enable_animation_layer — signalled on every shot, not just the first:
   *  that is what re-kicks Idle's `recover` pose for each tap of the buster. */
  private enable_animation_layer(): void {
    this.character.set_animation_layer('pointing_cannon');
    this.character.events.emit('shot_layer_enabled');
    this.disabled_layer = false;
  }

  private disable_animation_layer(): void {
    if (this.disabled_layer) return;
    this.character.set_animation_layer('normal');
    this.character.events.emit('shot_layer_disabled');
    this.disabled_layer = true;
  }

  /** Shot.gd:_Interrupt — the arm goes back down when the window expires. */
  override _Interrupt(): void {
    this.disable_animation_layer();
  }

  private Has_time_ran_out(): boolean {
    return this.arm_point_duration < this.timer;
  }

  override _EndCondition(): boolean {
    return !this.character.get_action_just_pressed('fire') && this.Has_time_ran_out();
  }
}
