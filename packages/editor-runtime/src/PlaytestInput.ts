import { Input } from "@mmx/engine";
import { packInput } from "@mmx/engine";

export type PlaytestAction =
  | "move_left"
  | "move_right"
  | "move_up"
  | "move_down"
  | "jump"
  | "dash"
  | "fire"
  | "weapon_left"
  | "weapon_right";

const KEY_MAP: Record<string, PlaytestAction> = {
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

const ALL_ACTIONS: readonly PlaytestAction[] = [
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

  set(action: PlaytestAction, down: boolean): void {
    this.input.setDown(action, down);
  }

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

  /** @internal Packed mask for the fixed-step driver. Not part of the public contract. */
  toMask(): number {
    return packInput(this.input);
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
