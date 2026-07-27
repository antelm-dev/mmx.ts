import { BrowserInput } from "@mmx/browser-input";
import type { KeyBindings } from "../settings/SettingsModel.js";
import type { DebugSession } from "../debug/DebugSession.js";
import type { SoundEffects } from "@mmx/browser-audio";

/**
 * Keyboard and gamepad, folded down to the same Action set and routed
 * to whichever modal screen (if any) is open.
 *
 * Physical browser state lives in {@link BrowserInput}; this coordinator only
 * owns Web-specific menu/debug/pause policy on top of it.
 */

interface ModalKeyTarget {
  readonly visible: boolean;
  handleKey(code: string): boolean;
}

export interface InputBindingOptions {
  getBindings: () => KeyBindings;
  menu: ModalKeyTarget & { readonly isCapturing: boolean };
  home: ModalKeyTarget;
  debug: DebugSession;
  sounds: SoundEffects;
  isPauseOnBlur: () => boolean;
}

export class InputBinding {
  private readonly browser: BrowserInput;

  /** Set only when blur is what paused the game, so focus resumes exactly that
   * and never a pause the player set deliberately. */
  private pausedByBlur = false;

  constructor(private readonly options: InputBindingOptions) {
    this.browser = new BrowserInput({
      getBindings: () => options.getBindings(),
      beforeKeyDown: (e) => this.routeModalKey(e),
      afterUnboundKeyDown: (e) => {
        if (!e.repeat && options.debug.handleKey(e.code)) e.preventDefault();
      },
      onActivity: () => options.sounds.unlock(),
      onBlur: () => this.onBlur(),
      onFocus: () => this.onFocus(),
      onGamepadConnected: (e) => {
        options.debug.notify(`gamepad ${e.gamepad.index}: ${e.gamepad.id.slice(0, 40)}`);
      },
      onGamepadDisconnected: (e) => {
        options.debug.notify(`gamepad ${e.gamepad.index} disconnected`);
      },
    });
    this.browser.attach();
  }

  /** This frame's combined action mask, for the fixed step to pack into the scene. */
  packedActions(): number {
    return this.browser.packedMask();
  }

  pollPad(dt: number, modalOpen: boolean): void {
    this.browser.pollGamepads(dt, modalOpen);
  }

  /** Feed the frame's pad presses to whichever player-facing screen is open. */
  applyPadMenuCodes(): void {
    const { menu, home, sounds } = this.options;
    const codes = this.browser.takeMenuCodes();
    if (codes.length > 0) sounds.unlock();
    for (const code of codes) {
      if (menu.isCapturing && code !== "Escape") continue;
      if (menu.visible) menu.handleKey(code);
      else if (home.visible) home.handleKey(code);
      else menu.handleKey(code);
    }
  }

  releaseAll(): void {
    this.browser.clearKeyboard();
  }

  private routeModalKey(e: KeyboardEvent): boolean {
    const { menu, home, sounds } = this.options;
    sounds.unlock();
    if (menu.visible) {
      if (menu.handleKey(e.code)) {
        e.preventDefault();
        return true;
      }
    }
    if (home.visible) {
      if (home.handleKey(e.code)) {
        e.preventDefault();
        return true;
      }
    }
    if (!e.repeat && menu.handleKey(e.code)) {
      e.preventDefault();
      return true;
    }
    return false;
  }

  private onBlur(): void {
    const { debug } = this.options;
    if (this.options.isPauseOnBlur() && !debug.paused) {
      debug.paused = true;
      this.pausedByBlur = true;
      debug.notify("paused — focus lost");
    }
  }

  private onFocus(): void {
    if (!this.pausedByBlur) return;
    this.pausedByBlur = false;
    this.options.debug.paused = false;
    this.options.debug.notify("resumed — focus regained");
  }
}
