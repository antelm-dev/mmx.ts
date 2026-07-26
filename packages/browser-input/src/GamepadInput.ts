import { Input, type Action } from "@mmx/engine";

const STICK_THRESHOLD = 0.5;

const REPEAT_DELAY = 0.4;
const REPEAT_INTERVAL = 0.12;

const BUTTON_ACTIONS: Readonly<Record<number, Action>> = {
  0: "jump",
  1: "dash",
  2: "fire",
  3: "fire",
  4: "dash",
  5: "dash",
  6: "weapon_left",
  7: "weapon_right",
  12: "move_up",
  13: "move_down",
  14: "move_left",
  15: "move_right",
};

const MENU_CODES: Readonly<Record<number, string>> = {
  0: "Enter",
  1: "Escape",
  2: "Delete",
  9: "Escape",
  12: "ArrowUp",
  13: "ArrowDown",
  14: "ArrowLeft",
  15: "ArrowRight",
};

const REPEATABLE = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

const PAD_ACTIONS: readonly Action[] = [...new Set(Object.values(BUTTON_ACTIONS))];

export type GetGamepads = () => Array<Gamepad | null>;

const defaultGetGamepads: GetGamepads = () => navigator.getGamepads?.() ?? [];

function connectedPads(getGamepads: GetGamepads): Gamepad[] {
  return getGamepads().filter((pad): pad is Gamepad => pad !== null);
}

function sample(pad: Gamepad, held: Set<Action>, menu: Set<string>): void {
  for (const [index, button] of pad.buttons.entries()) {
    if (!button.pressed) continue;
    const action = BUTTON_ACTIONS[index];
    if (action) held.add(action);
    const code = MENU_CODES[index];
    if (code) menu.add(code);
  }

  const sticks = [
    [pad.axes[0] ?? 0, pad.axes[1] ?? 0],
    [pad.axes[2] ?? 0, pad.axes[3] ?? 0],
  ];
  for (const [x, y] of sticks) {
    const pushed: [boolean, Action, string][] = [
      [x <= -STICK_THRESHOLD, "move_left", "ArrowLeft"],
      [x >= STICK_THRESHOLD, "move_right", "ArrowRight"],
      [y <= -STICK_THRESHOLD, "move_up", "ArrowUp"],
      [y >= STICK_THRESHOLD, "move_down", "ArrowDown"],
    ];
    for (const [active, action, code] of pushed) {
      if (!active) continue;
      held.add(action);
      menu.add(code);
    }
  }
}

export class GamepadInput {
  readonly actions = new Input();

  private readonly stale = new Set<Action>();
  private readonly repeatAt = new Map<string, number>();
  private emitted: string[] = [];
  private readonly getGamepads: GetGamepads;

  constructor(getGamepads: GetGamepads = defaultGetGamepads) {
    this.getGamepads = getGamepads;
  }

  get connected(): boolean {
    return connectedPads(this.getGamepads).length > 0;
  }

  poll(dt: number, suppressGameplay: boolean): void {
    const held = new Set<Action>();
    const menu = new Set<string>();
    for (const pad of connectedPads(this.getGamepads)) sample(pad, held, menu);

    for (const action of PAD_ACTIONS) {
      const down = held.has(action);
      if (!down) this.stale.delete(action);
      else if (suppressGameplay) this.stale.add(action);
      this.actions.setDown(action, down && !suppressGameplay && !this.stale.has(action));
    }
    this.trackMenuEdges(menu, dt);
  }

  takeMenuCodes(): string[] {
    if (this.emitted.length === 0) return this.emitted;
    const codes = this.emitted;
    this.emitted = [];
    return codes;
  }

  releaseAll(): void {
    for (const action of PAD_ACTIONS) {
      this.actions.setDown(action, false);
      this.stale.add(action);
    }
    this.repeatAt.clear();
    this.emitted = [];
  }

  private trackMenuEdges(down: Set<string>, dt: number): void {
    for (const code of this.repeatAt.keys()) {
      if (!down.has(code)) this.repeatAt.delete(code);
    }
    for (const code of down) {
      const remaining = this.repeatAt.get(code);
      if (remaining === undefined) {
        this.emitted.push(code);
        this.repeatAt.set(code, REPEAT_DELAY);
      } else if (!REPEATABLE.has(code)) {
        this.repeatAt.set(code, remaining);
      } else if (remaining - dt <= 0) {
        this.emitted.push(code);
        this.repeatAt.set(code, REPEAT_INTERVAL);
      } else {
        this.repeatAt.set(code, remaining - dt);
      }
    }
  }
}
