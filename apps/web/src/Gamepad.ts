import { Input, type Action } from "@mmx/engine/core/Input.js";

/**
 * Gamepad support, on top of the same {@link Action} set the keyboard produces.
 *
 * The Gamepad API has no events for button state — `navigator.getGamepads()`
 * returns a fresh snapshot and nothing is delivered in between — so unlike the
 * keyboard this has to be *polled*, once per animation frame, and every edge the
 * menu cares about has to be derived here by diffing against the previous poll.
 *
 * The pad is deliberately not rebindable and does not go through
 * {@link KeyBindings}: those are `KeyboardEvent.code` values, and a settings file
 * that mixed them with button indices would need a schema version bump plus a
 * capture mode in the menu that can tell a stray trigger from a deliberate press.
 * The map below is the fixed PS2-era Mega Man X layout, which is what a pad user
 * expects anyway.
 */

/**
 * How far a stick must leave centre to read as a direction.
 *
 * Well past the usual drift deadzone (~0.15), because this is not a drift
 * filter — the sticks are being used as a d-pad, and a dash that ends because
 * the stick drifted back to 0.2 while the player was still pushing is worse than
 * one that needs a firm push to start.
 */
const STICK_THRESHOLD = 0.5;

/** Repeat timings for held menu directions, matching a typical key-repeat feel. */
const REPEAT_DELAY = 0.4;
const REPEAT_INTERVAL = 0.12;

/**
 * Standard-mapping button index to gameplay action.
 *
 * Face buttons in standard-mapping order are [cross/A, circle/B, square/X,
 * triangle/Y], so square is fire and cross is jump exactly as on the original,
 * and every shoulder is a dash because that is the other half of the muscle
 * memory. Buttons 12-15 are the d-pad.
 */
const BUTTON_ACTIONS: Readonly<Record<number, Action>> = {
  0: "jump",
  1: "dash",
  2: "fire",
  3: "fire",
  4: "dash",
  5: "dash",
  6: "dash",
  7: "dash",
  12: "move_up",
  13: "move_down",
  14: "move_left",
  15: "move_right",
};

/**
 * Button index to the `KeyboardEvent.code` the settings menu already handles.
 *
 * Synthesizing codes rather than teaching the menu a second input vocabulary:
 * it navigates by code today, and every one of these is a code it already has a
 * case for. Start doubles as Escape so the pad can open the menu at all.
 */
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

/** Only the directions auto-repeat; confirm and cancel fire once per press. */
const REPEATABLE = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

function pads(): Gamepad[] {
  // getGamepads() is sparse: a disconnected slot stays in the array as null.
  return navigator.getGamepads?.().filter((pad): pad is Gamepad => pad !== null) ?? [];
}

/** Fold one pad's buttons and sticks into the frame's action and menu-code sets. */
function sample(pad: Gamepad, held: Set<Action>, menu: Set<string>): void {
  for (const [index, button] of pad.buttons.entries()) {
    if (!button.pressed) continue;
    const action = BUTTON_ACTIONS[index];
    if (action) held.add(action);
    const code = MENU_CODES[index];
    if (code) menu.add(code);
  }

  // Axes 0/1 are the left stick under standard mapping. Both sticks are read so
  // a player who defaults to the right one is not simply ignored.
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
  /**
   * The actions the pad is asserting right now.
   *
   * Kept separate from the keyboard's rather than written into it, because a
   * poll rewrites *every* action every frame — folding it into the keyboard's
   * state would clear a key the player is physically still holding the first
   * time a pad reported nothing.
   */
  readonly actions = new Input();

  /**
   * Actions that must be released before they count again.
   *
   * A polled device has no equivalent of "no keyup ever arrived": a button held
   * across a modal menu or a focus loss is still physically down, and without
   * this the frame the menu closes would read circle — the button that closed
   * it — as a dash. The keyboard gets this behaviour for free, because a key
   * held through a blur simply never sends another keydown.
   */
  private readonly stale = new Set<Action>();

  /** Menu codes that were active at the last poll, and their time until repeat. */
  private readonly repeatAt = new Map<string, number>();
  private emitted: string[] = [];

  get connected(): boolean {
    return pads().length > 0;
  }

  /**
   * Sample every connected pad. `dt` is wall-clock seconds since the last poll,
   * used only for menu repeat — gameplay actions are level-triggered and the
   * fixed step reads them whenever it runs.
   *
   * `menuOpen` suppresses the gameplay half: the menu is modal, and a stick held
   * on the way in would otherwise have X walking around behind the panel for as
   * long as it stayed open. (The keyboard gets this for free — it is edge-driven
   * and the menu swallows its events.)
   */
  poll(dt: number, menuOpen: boolean): void {
    const held = new Set<Action>();
    const menu = new Set<string>();
    for (const pad of pads()) sample(pad, held, menu);

    for (const action of Object.values(BUTTON_ACTIONS)) {
      const down = held.has(action);
      if (!down) this.stale.delete(action);
      else if (menuOpen) this.stale.add(action);
      this.actions.setDown(action, down && !menuOpen && !this.stale.has(action));
    }
    this.trackMenuEdges(menu, dt);
  }

  /**
   * The menu codes pressed since the last call, in no particular order, clearing
   * the queue. Codes not consumed on the frame they were produced are dropped
   * rather than buffered — a press that arrives two frames late reads as a stuck
   * cursor.
   */
  takeMenuCodes(): string[] {
    if (this.emitted.length === 0) return this.emitted;
    const codes = this.emitted;
    this.emitted = [];
    return codes;
  }

  /** Drop all state — on disconnect, and on focus loss alongside the keyboard. */
  releaseAll(): void {
    for (const action of Object.values(BUTTON_ACTIONS)) {
      this.actions.setDown(action, false);
      // Everything is presumed still held: alt-tabbing back with jump down must
      // not fire a jump, exactly as a keyboard held through a blur does not.
      this.stale.add(action);
    }
    this.repeatAt.clear();
    this.emitted = [];
  }

  /** Turn the level-triggered button set into presses, with repeat on directions. */
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
        // Held, but not a direction: nothing more to emit until it is released.
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
