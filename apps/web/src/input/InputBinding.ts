import { Input, type Action } from "@mmx/engine/core/Input.js";
import { packInput } from "@mmx/engine/core/Replay.js";
import { BINDABLE_ACTIONS, type KeyBindings } from "../DesktopBridge.js";
import type { DebugSession } from "../debug/DebugSession.js";
import { GamepadInput } from "../Gamepad.js";
import type { SoundEffects } from "../SoundEffects.js";

/**
 * Keyboard and gamepad, folded down to the same {@link Action} set and routed
 * to whichever modal screen (if any) is open.
 *
 * The keyboard's held state is deliberately not the scene's own Input — see
 * {@link InputBinding.held}'s doc comment — and the gamepad's is deliberately
 * not merged into the keyboard's, since the two are updated on opposite
 * schedules (events vs. a poll that rewrites every action every frame).
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
  /**
   * The keys physically held right now.
   *
   * Deliberately *not* the scene's own Input. The scene's is derived — every tick
   * it is written from the recorded input mask, including while a rewind replays
   * hundreds of ticks in one frame. If the browser wrote key state there directly,
   * a rewind would leave whatever the last replayed frame held, and a player who
   * was running right would silently stop the moment they restarted a checkpoint.
   * This one is the authority, and each tick packs a mask from it.
   */
  private readonly held = new Input();

  /**
   * The pad's half of the same picture, polled once per frame.
   *
   * Held apart from {@link held} rather than merged into it because the two are
   * updated on opposite schedules — the keyboard on events, the pad by a poll that
   * rewrites every action every frame — and a poll that found no pad would clear
   * a key the player is still holding. They are ORed together at pack time, so a
   * player can hold left on the stick and jump on the keyboard.
   */
  private readonly pad = new GamepadInput();

  /** Set only when {@link onBlur} is what paused the game, so {@link onFocus}
   * resumes exactly that and never a pause the player set deliberately. */
  private pausedByBlur = false;

  constructor(private readonly options: InputBindingOptions) {
    window.addEventListener("keydown", (e) => this.onKeyDown(e));
    window.addEventListener("keyup", (e) => this.onKeyUp(e));
    window.addEventListener("blur", () => this.onBlur());
    window.addEventListener("focus", () => this.onFocus());
    // A pad is not enumerable until it reports something, so these are the only
    // notice the player gets that it was seen at all.
    window.addEventListener("gamepadconnected", (e) => {
      options.debug.notify(`gamepad ${e.gamepad.index}: ${e.gamepad.id.slice(0, 40)}`);
    });
    window.addEventListener("gamepaddisconnected", (e) => {
      // Whatever was held at the moment the cable came out is held forever otherwise:
      // the poll only ever sees pads that are still there.
      this.pad.releaseAll();
      options.debug.notify(`gamepad ${e.gamepad.index} disconnected`);
    });
  }

  /** This frame's combined action mask, for the fixed step to pack into the scene. */
  packedActions(): number {
    return packInput(this.held) | packInput(this.pad.actions);
  }

  pollPad(dt: number, modalOpen: boolean): void {
    this.pad.poll(dt, modalOpen);
  }

  /** Feed the frame's pad presses to whichever player-facing screen is open. */
  applyPadMenuCodes(): void {
    const { menu, home, sounds } = this.options;
    const codes = this.pad.takeMenuCodes();
    if (codes.length > 0) sounds.unlock();
    for (const code of codes) {
      // A capturing slot takes the next code as a binding, and these codes are
      // synthesized — binding one would write a key into the settings file that no
      // keyboard can ever press again. Only the cancel gets through.
      if (menu.isCapturing && code !== "Escape") continue;
      if (menu.visible) menu.handleKey(code);
      else if (home.visible) home.handleKey(code);
      // Neither modal is up: this is gameplay, and Escape (Start on the pad) must
      // still open the pause menu, exactly as it does from the keyboard.
      else menu.handleKey(code);
    }
  }

  releaseAll(): void {
    for (const action of BINDABLE_ACTIONS) this.held.setDown(action, false);
  }

  /**
   * Which action a key means right now, from the player's own bindings.
   *
   * A lookup over seven actions rather than a prebuilt code->action map, because
   * the map is now editable at runtime and a cached one would need rebuilding on
   * every rebind. Fourteen string compares per key event is nothing next to that.
   */
  private actionFor(code: string): Action | undefined {
    const bindings = this.options.getBindings();
    return BINDABLE_ACTIONS.find((action) => bindings[action].includes(code));
  }

  private onKeyDown(e: KeyboardEvent): void {
    const { menu, home, debug, sounds } = this.options;
    sounds.unlock();
    // Modal UI first: while either screen is open gameplay never sees the same key.
    if (menu.visible) {
      if (menu.handleKey(e.code)) {
        e.preventDefault();
        return;
      }
    }
    if (home.visible) {
      if (home.handleKey(e.code)) {
        e.preventDefault();
        return;
      }
    }
    if (!e.repeat && menu.handleKey(e.code)) {
      e.preventDefault();
      return;
    }

    // Gameplay before debug, so a key the player has explicitly bound always does
    // what they bound it to. The default map shares no code with a debug command,
    // and the menu refuses to bind the function keys, so the debug layer survives
    // any rebind that can be made from inside the game.
    const a = this.actionFor(e.code);
    if (a) {
      this.held.setDown(a, true);
      e.preventDefault();
      return;
    }
    if (!e.repeat && debug.handleKey(e.code)) e.preventDefault();
  }

  private onKeyUp(e: KeyboardEvent): void {
    const a = this.actionFor(e.code);
    if (a) {
      this.held.setDown(a, false);
      e.preventDefault();
    }
  }

  private onBlur(): void {
    const { debug } = this.options;
    this.releaseAll();
    this.pad.releaseAll();
    if (this.options.isPauseOnBlur() && !debug.paused) {
      debug.paused = true;
      this.pausedByBlur = true;
      debug.notify("paused — focus lost");
    }
  }

  /**
   * Resumes only the pause {@link onBlur} itself applied. A pause the player set
   * deliberately (the P key) before tabbing away must survive refocus — otherwise
   * alt-tabbing back would silently unpause a game they meant to leave stopped.
   */
  private onFocus(): void {
    if (!this.pausedByBlur) return;
    this.pausedByBlur = false;
    this.options.debug.paused = false;
    this.options.debug.notify("resumed — focus regained");
  }
}
