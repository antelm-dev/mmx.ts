import { BaseAbility } from './BaseAbility.js';
import type { Action } from '../../core/Input.js';

/**
 * Input-aware ability — port of Ability.gd.
 *
 * Adds trigger actions, hold-vs-tap semantics, "let go of input" tracking and an
 * input buffer (get_activation_leeway_time) matching Ability.check_all_actions_for_input.
 */
export abstract class Ability extends BaseAbility {
  actions: Action[] = [];
  input = 0;
  has_let_go_of_input = false;
  private lastPressMs = -1e9;

  /** Input buffer window (Dash.leeway, Jump.leeway_time). 0 = no buffering. */
  get_activation_leeway_time(): number {
    return 0;
  }

  /** True for states you sustain by holding (Walk, WallSlide, Charge). */
  should_execute_on_hold(): boolean {
    return false;
  }

  /** Called every frame for every ability so buffered presses are captured. */
  pollBuffer(): void {
    if (this.get_activation_leeway_time() > 0) {
      for (const a of this.actions) {
        if (this.character.get_action_just_pressed(a)) {
          this.lastPressMs = this.get_time();
        }
      }
    }
  }

  protected bufferedRecently(): boolean {
    return (
      this.get_time() - this.lastPressMs <=
      this.get_activation_leeway_time() * 1000
    );
  }

  consumeBuffer(): void {
    this.lastPressMs = -1e9;
  }

  inputTriggered(): boolean {
    if (this.actions.length === 0) return true; // "Always"
    if (this.should_execute_on_hold()) {
      return this.actions.some((a) => this.character.get_action_pressed(a));
    }
    for (const a of this.actions) {
      if (this.character.get_action_just_pressed(a)) return true;
    }
    if (this.get_activation_leeway_time() > 0 && this.bufferedRecently()) {
      return true;
    }
    return false;
  }

  override shouldExecute(): boolean {
    return this.inputTriggered();
  }

  /**
   * Ability.gd:Initialize — the clip is chosen by the ability itself, before
   * _Setup runs, from the `animation` field (exported per node in Player.tscn).
   */
  override Initialize(): void {
    super.Initialize();
    this.play_animation_on_initialize();
  }

  /** Ability.gd:play_animation_on_initialize. Overridden by Fall (don't restart an
   *  already-playing clip), Walk (walk_start intro) and Shot (swaps layer instead). */
  play_animation_on_initialize(): void {
    if (this.animation) this.play_animation(this.animation);
  }

  override BeforeEveryFrame(dt: number): void {
    super.BeforeEveryFrame(dt);
    this.input = this.currentInputValue();
    if (this.input === 0) this.has_let_go_of_input = true;
  }

  override Finalize(): void {
    this.has_let_go_of_input = false;
    super.Finalize();
  }

  protected currentInputValue(): number {
    if (this.actions.length === 0) return 1;
    return this.actions.some((a) => this.character.get_action_pressed(a)) ? 1 : 0;
  }

  Is_Input_Happening(): boolean {
    return this.input > 0;
  }

  get_pressed_direction(): number {
    return this.character.get_pressed_axis();
  }
}
