import { Input, REPLAY_ACTIONS, packInput, type Action } from "@mmx/engine";
import type { BrowserInputBindings } from "./bindings.js";
import { GamepadInput, type GetGamepads } from "./GamepadInput.js";

export type EventTargetLike = Pick<Window, "addEventListener" | "removeEventListener">;

/** Synthesized UI navigation codes from the gamepad (Enter, Escape, Arrow*, …). */
export type NavigationCommand = string;

export interface BrowserInputOptions {
  getBindings: () => BrowserInputBindings;
  target?: EventTargetLike;
  getGamepads?: GetGamepads;
  /** Return true to swallow the keydown before gameplay mapping. */
  beforeKeyDown?: (e: KeyboardEvent) => boolean;
  afterUnboundKeyDown?: (e: KeyboardEvent) => void;
  onActivity?: () => void;
  onNavigation?: (command: NavigationCommand) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  onGamepadConnected?: (e: GamepadEvent) => void;
  onGamepadDisconnected?: (e: GamepadEvent) => void;
}

export class BrowserInput {
  private readonly keyboard = new Input();
  private readonly virtual = new Input();
  private readonly pressedCodes = new Set<string>();
  private readonly pad: GamepadInput;
  private attached = false;
  private target: EventTargetLike | null = null;

  constructor(private readonly options: BrowserInputOptions) {
    this.pad = new GamepadInput(options.getGamepads);
  }

  get gamepadConnected(): boolean {
    return this.pad.connected;
  }

  attach(): void {
    if (this.attached) return;
    const target = this.options.target ?? globalThis.window;
    if (!target) {
      throw new Error("BrowserInput.attach() requires a window or options.target");
    }
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.onBlur);
    target.addEventListener("focus", this.onFocus);
    target.addEventListener("gamepadconnected", this.onGamepadConnected);
    target.addEventListener("gamepaddisconnected", this.onGamepadDisconnected);
    this.target = target;
    this.attached = true;
  }

  detach(): void {
    if (!this.attached || !this.target) return;
    this.target.removeEventListener("keydown", this.onKeyDown);
    this.target.removeEventListener("keyup", this.onKeyUp);
    this.target.removeEventListener("blur", this.onBlur);
    this.target.removeEventListener("focus", this.onFocus);
    this.target.removeEventListener("gamepadconnected", this.onGamepadConnected);
    this.target.removeEventListener("gamepaddisconnected", this.onGamepadDisconnected);
    this.target = null;
    this.attached = false;
    this.clear();
  }

  poll(dt: number, suppressGameplay = false): void {
    this.pollGamepads(dt, suppressGameplay);
  }

  pollGamepads(elapsedSeconds: number, suppressGameplay = false): void {
    this.pad.poll(elapsedSeconds, suppressGameplay);
    if (!this.options.onNavigation) return;
    for (const command of this.pad.takeMenuCodes()) {
      this.options.onNavigation(command);
    }
  }

  toMask(): number {
    return this.packedMask();
  }

  packedMask(): number {
    this.syncKeyboard();
    return packInput(this.keyboard) | packInput(this.pad.actions);
  }

  set(action: Action, down: boolean): void {
    this.virtual.setDown(action, down);
    this.syncKeyboard();
  }

  clearKeyboard(): void {
    this.pressedCodes.clear();
    for (const action of REPLAY_ACTIONS) {
      this.virtual.setDown(action, false);
      this.keyboard.setDown(action, false);
    }
  }

  clearGamepads(): void {
    this.pad.releaseAll();
  }

  clear(): void {
    this.clearKeyboard();
    this.clearGamepads();
  }

  /** @deprecated Prefer {@link clearKeyboard}. */
  releaseAll(): void {
    this.clearKeyboard();
  }

  /** @deprecated Prefer {@link clear}. */
  reset(): void {
    this.clear();
  }

  takeMenuCodes(): string[] {
    return this.pad.takeMenuCodes();
  }

  private syncKeyboard(): void {
    const bindings = this.options.getBindings();
    for (const action of REPLAY_ACTIONS) {
      const codes = bindings[action] ?? [];
      const fromKeys = codes.some((code) => code !== "" && this.pressedCodes.has(code));
      this.keyboard.setDown(action, fromKeys || this.virtual.isPressed(action));
    }
  }

  private actionFor(code: string): Action | undefined {
    if (!code) return undefined;
    const bindings = this.options.getBindings();
    return REPLAY_ACTIONS.find((action) => bindings[action]?.includes(code));
  }

  private readonly onKeyDown = (e: Event): void => {
    const event = e as KeyboardEvent;
    if (this.options.beforeKeyDown?.(event)) return;

    this.options.onActivity?.();

    const action = this.actionFor(event.code);
    if (action) {
      this.pressedCodes.add(event.code);
      this.syncKeyboard();
      event.preventDefault();
      return;
    }
    this.options.afterUnboundKeyDown?.(event);
  };

  private readonly onKeyUp = (e: Event): void => {
    const event = e as KeyboardEvent;
    const tracked = this.pressedCodes.delete(event.code);
    const action = this.actionFor(event.code);
    if (!tracked && !action) return;
    this.syncKeyboard();
    if (action) event.preventDefault();
  };

  private readonly onBlur = (): void => {
    this.clear();
    this.options.onBlur?.();
  };

  private readonly onFocus = (): void => {
    this.options.onFocus?.();
  };

  private readonly onGamepadConnected = (e: Event): void => {
    this.options.onActivity?.();
    this.options.onGamepadConnected?.(e as GamepadEvent);
  };

  private readonly onGamepadDisconnected = (e: Event): void => {
    this.clearGamepads();
    this.options.onActivity?.();
    this.options.onGamepadDisconnected?.(e as GamepadEvent);
  };
}
