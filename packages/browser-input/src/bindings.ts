import { REPLAY_ACTIONS, type Action } from "@mmx/engine";

/** Flexible runtime map: one or more `KeyboardEvent.code` values per action. */
export type BrowserInputBindings = Readonly<Partial<Record<Action, readonly string[]>>>;

/**
 * Settings-menu shape: exactly two slots per action.
 * An empty string is an unbound slot.
 */
export type KeyBindings = Record<Action, [string, string]>;

export const BINDABLE_ACTIONS: readonly Action[] = REPLAY_ACTIONS;

/** Default Web / desktop gameplay bindings (two slots per action). */
export const DEFAULT_BINDINGS: KeyBindings = {
  move_left: ["ArrowLeft", "KeyA"],
  move_right: ["ArrowRight", "KeyD"],
  move_up: ["ArrowUp", "KeyW"],
  move_down: ["ArrowDown", "KeyS"],
  jump: ["Space", "KeyK"],
  dash: ["ShiftLeft", "KeyL"],
  fire: ["KeyJ", "KeyF"],
  weapon_left: ["KeyQ", "BracketLeft"],
  weapon_right: ["KeyE", "BracketRight"],
};

/** Studio / tooling playtest defaults (variable-length lists are fine). */
export const DEFAULT_TOOLING_BINDINGS: BrowserInputBindings = {
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

export function cloneBindings(bindings: KeyBindings): KeyBindings {
  return Object.fromEntries(
    BINDABLE_ACTIONS.map((action) => [action, [...bindings[action]] as [string, string]]),
  ) as KeyBindings;
}

export function isKeyBindings(value: unknown): value is KeyBindings {
  if (!value || typeof value !== "object") return false;
  const bindings = value as Record<string, unknown>;
  if (Object.keys(bindings).length !== BINDABLE_ACTIONS.length) return false;
  return BINDABLE_ACTIONS.every((action) => {
    const slots = bindings[action];
    return Array.isArray(slots) && slots.length === 2 && slots.every((s) => typeof s === "string");
  });
}

/** Keep known action slots; fill missing / malformed ones from defaults. */
export function mergeBindings(
  value: unknown,
  defaults: KeyBindings = DEFAULT_BINDINGS,
): KeyBindings {
  const existing = (value && typeof value === "object" ? value : {}) as Partial<
    Record<Action, unknown>
  >;
  return Object.fromEntries(
    BINDABLE_ACTIONS.map((action) => {
      const slots = existing[action];
      const valid =
        Array.isArray(slots) && slots.length === 2 && slots.every((s) => typeof s === "string");
      return [action, valid ? [...(slots as [string, string])] : [...defaults[action]]];
    }),
  ) as KeyBindings;
}

/**
 * Assign `code` to `bindings[action][slot]`, clearing that code from every
 * other slot so a key never maps to two actions.
 */
export function assignBinding(
  bindings: KeyBindings,
  action: Action,
  slot: number,
  code: string,
): KeyBindings {
  const next = cloneBindings(bindings);
  if (code) {
    for (const other of BINDABLE_ACTIONS) {
      for (let i = 0; i < next[other].length; i++) {
        if (next[other][i] === code) next[other][i] = "";
      }
    }
  }
  next[action][slot] = code;
  return next;
}
