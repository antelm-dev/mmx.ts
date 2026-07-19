/**
 * Input abstraction. Mirrors Godot's Input.is_action_pressed / just_pressed /
 * just_released with per-frame edge detection.
 *
 * Actions map to the Godot input map (project.godot):
 *   move_left, move_right, move_up, move_down, jump, dash, fire,
 *   weapon_left, weapon_right (WeaponChanger.gd's weapon_select_left/right).
 */
export type Action =
  | "move_left"
  | "move_right"
  | "move_up"
  | "move_down"
  | "jump"
  | "dash"
  | "fire"
  | "weapon_left"
  | "weapon_right";

export class Input {
  private cur = new Set<Action>();
  private prev = new Set<Action>();

  /** Set the live pressed-state of an action (called by event handlers / sim). */
  setDown(a: Action, down: boolean): void {
    if (down) this.cur.add(a);
    else this.cur.delete(a);
  }

  /** Snapshot the current state so just_pressed/just_released can be computed. */
  newFrame(): void {
    this.prev = new Set(this.cur);
  }

  isPressed(a: Action): boolean {
    return this.cur.has(a);
  }

  justPressed(a: Action): boolean {
    return this.cur.has(a) && !this.prev.has(a);
  }

  justReleased(a: Action): boolean {
    return !this.cur.has(a) && this.prev.has(a);
  }

  /** get_pressed_axis(): -1 left, +1 right, 0 none (Character.gd:236). */
  axis(): number {
    let a = 0;
    if (this.isPressed("move_left")) a -= 1;
    if (this.isPressed("move_right")) a += 1;
    return a;
  }

  justPressedLeft(): boolean {
    return this.justPressed("move_left");
  }
  justPressedRight(): boolean {
    return this.justPressed("move_right");
  }
}
