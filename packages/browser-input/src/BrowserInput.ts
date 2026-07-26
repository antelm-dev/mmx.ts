import { Input, REPLAY_ACTIONS, packInput, type Action } from "@mmx/engine";
import { GamepadInput, type GetGamepads } from "./GamepadInput.js";

export type BrowserInputBindings = Readonly<Partial<Record<Action, readonly string[]>>>;

export interface BrowserInputOptions {
  getBindings: () => BrowserInputBindings;
  beforeKeyDown?: (e: KeyboardEvent) => boolean;
  afterUnboundKeyDown?: (e: KeyboardEvent) => void;
  onBlur?: () => void;
  onFocus?: () => void;
  onGamepadConnected?: (e: GamepadEvent) => void;
  onGamepadDisconnected?: (e: GamepadEvent) => void;
  getGamepads?: GetGamepads;
}

export class BrowserInput {
  private readonly held = new Input();
  private readonly pad: GamepadInput;
  private attached = false;

  constructor(private readonly options: BrowserInputOptions) {
    this.pad = new GamepadInput(options.getGamepads);
  }

  get gamepadConnected(): boolean {
    return this.pad.connected;
  }

  attach(): void {
    if (this.attached) return;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("focus", this.onFocus);
    window.addEventListener("gamepadconnected", this.onGamepadConnected);
    window.addEventListener("gamepaddisconnected", this.onGamepadDisconnected);
    this.attached = true;
  }

  detach(): void {
    if (!this.attached) return;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("focus", this.onFocus);
    window.removeEventListener("gamepadconnected", this.onGamepadConnected);
    window.removeEventListener("gamepaddisconnected", this.onGamepadDisconnected);
    this.releaseAll();
    this.pad.releaseAll();
    this.attached = false;
  }

  poll(dt: number, suppressGameplay = false): void {
    this.pad.poll(dt, suppressGameplay);
  }

  toMask(): number {
    return packInput(this.held) | packInput(this.pad.actions);
  }

  set(action: Action, down: boolean): void {
    this.held.setDown(action, down);
  }

  releaseAll(): void {
    for (const action of REPLAY_ACTIONS) this.held.setDown(action, false);
  }

  takeMenuCodes(): string[] {
    return this.pad.takeMenuCodes();
  }

  private actionFor(code: string): Action | undefined {
    const bindings = this.options.getBindings();
    return REPLAY_ACTIONS.find((action) => bindings[action]?.includes(code));
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (this.options.beforeKeyDown?.(e)) return;

    const action = this.actionFor(e.code);
    if (action) {
      this.held.setDown(action, true);
      e.preventDefault();
      return;
    }
    this.options.afterUnboundKeyDown?.(e);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const action = this.actionFor(e.code);
    if (action) {
      this.held.setDown(action, false);
      e.preventDefault();
    }
  };

  private readonly onBlur = (): void => {
    this.releaseAll();
    this.pad.releaseAll();
    this.options.onBlur?.();
  };

  private readonly onFocus = (): void => {
    this.options.onFocus?.();
  };

  private readonly onGamepadConnected = (e: Event): void => {
    this.options.onGamepadConnected?.(e as GamepadEvent);
  };

  private readonly onGamepadDisconnected = (e: Event): void => {
    this.pad.releaseAll();
    this.options.onGamepadDisconnected?.(e as GamepadEvent);
  };
}
