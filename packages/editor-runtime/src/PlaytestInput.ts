import { BrowserInput, type BrowserInputBindings, type GetGamepads } from "@mmx/browser-input";
import type { Action } from "@mmx/engine";

export type PlaytestAction = Action;

const PLAYTEST_BINDINGS: BrowserInputBindings = {
  move_left: ["ArrowLeft", "KeyA"],
  move_right: ["ArrowRight", "KeyD"],
  move_up: ["ArrowUp", "KeyW"],
  move_down: ["ArrowDown", "KeyS"],
  jump: ["Space", "KeyZ"],
  dash: ["KeyK", "KeyX", "ShiftLeft"],
  fire: ["KeyC", "KeyJ"],
  weapon_left: ["KeyQ"],
  weapon_right: ["KeyE"],
};

export class PlaytestInput {
  private readonly browser: BrowserInput;

  constructor(options?: { getGamepads?: GetGamepads }) {
    this.browser = new BrowserInput({
      getBindings: () => PLAYTEST_BINDINGS,
      getGamepads: options?.getGamepads,
    });
  }

  set(action: PlaytestAction, down: boolean): void {
    this.browser.set(action, down);
  }

  clear(): void {
    this.browser.reset();
  }

  attach(): void {
    this.browser.attach();
  }

  detach(): void {
    this.browser.detach();
  }

  poll(dt: number): void {
    this.browser.poll(dt, false);
  }

  /** @internal Packed mask for the fixed-step driver. Not part of the public contract. */
  toMask(): number {
    return this.browser.toMask();
  }
}
