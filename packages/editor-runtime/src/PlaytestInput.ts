import {
  BrowserInput,
  DEFAULT_TOOLING_BINDINGS,
  isEditableKeyTarget,
  type BrowserInputOptions,
  type GetGamepads,
} from "@mmx/browser-input";
import type { Action } from "@mmx/engine";

export type PlaytestAction = Action;

export class PlaytestInput {
  private readonly browser: BrowserInput;

  constructor(options?: {
    getBindings?: BrowserInputOptions["getBindings"];
    getGamepads?: GetGamepads;
    beforeKeyDown?: BrowserInputOptions["beforeKeyDown"];
    target?: BrowserInputOptions["target"];
  }) {
    this.browser = new BrowserInput({
      getBindings: options?.getBindings ?? (() => DEFAULT_TOOLING_BINDINGS),
      getGamepads: options?.getGamepads,
      target: options?.target,
      beforeKeyDown: (e) => {
        if (options?.beforeKeyDown?.(e)) return true;
        return isEditableKeyTarget(e.target);
      },
    });
  }

  set(action: PlaytestAction, down: boolean): void {
    this.browser.set(action, down);
  }

  clear(): void {
    this.browser.clear();
  }

  attach(): void {
    this.browser.attach();
  }

  detach(): void {
    this.browser.detach();
  }

  poll(dt: number): void {
    this.browser.pollGamepads(dt, false);
  }

  /** @internal Packed mask for the fixed-step driver. Not part of the public contract. */
  toMask(): number {
    return this.browser.packedMask();
  }
}
