import {
  BrowserInput,
  type GetGamepads,
} from "@mmx/runtime/browser";
import { TOOLING_BINDINGS } from "@mmx/runtime/tooling";
import type { Action } from "@mmx/engine";

export type PlaytestAction = Action;

export class PlaytestInput {
  private readonly browser: BrowserInput;

  constructor(options?: { getGamepads?: GetGamepads }) {
    this.browser = new BrowserInput({
      getBindings: () => TOOLING_BINDINGS,
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
