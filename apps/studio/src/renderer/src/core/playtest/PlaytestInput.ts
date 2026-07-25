import { Input, type Action } from "@mmx/engine/core/Input.js";
import { packInput } from "@mmx/engine/core/Replay.js";

/**
 * Browser keyboard → engine input for a playtest.
 *
 * This is the only place DOM key events touch the simulation: it maps physical
 * keys to engine {@link Action}s, holds the live pressed-state, and hands the
 * controller a packed mask on demand. The engine never sees a `KeyboardEvent`.
 *
 * Two safety behaviours matter for a debugger. Losing focus (Alt-Tab, a dialog,
 * clicking the dock) must not leave a movement key "stuck" down, so `blur`
 * clears everything; and pausing with keys held must not resume into phantom
 * input, so the controller can {@link clear} on demand too.
 */
const KEY_MAP: Record<string, Action> = {
  ArrowLeft: "move_left",
  KeyA: "move_left",
  ArrowRight: "move_right",
  KeyD: "move_right",
  ArrowUp: "move_up",
  KeyW: "move_up",
  ArrowDown: "move_down",
  KeyS: "move_down",
  Space: "jump",
  KeyZ: "jump",
  KeyK: "dash",
  KeyX: "dash",
  ShiftLeft: "dash",
  KeyC: "fire",
  KeyJ: "fire",
  KeyQ: "weapon_left",
  KeyE: "weapon_right",
};

const ALL_ACTIONS: readonly Action[] = [
  "move_left",
  "move_right",
  "move_up",
  "move_down",
  "jump",
  "dash",
  "fire",
  "weapon_left",
  "weapon_right",
];

export class PlaytestInput {
  private readonly input = new Input();
  private attached = false;

  /** The packed input mask for the current pressed-state. */
  mask(): number {
    return packInput(this.input);
  }

  /** Release every action — used on blur and when pausing. */
  clear(): void {
    for (const action of ALL_ACTIONS) this.input.setDown(action, false);
  }

  attach(): void {
    if (this.attached) return;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.clear();
    this.attached = false;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    this.input.setDown(action, true);
    e.preventDefault();
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    this.input.setDown(action, false);
    e.preventDefault();
  };

  private readonly onBlur = (): void => {
    this.clear();
  };
}
