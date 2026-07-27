import { REPLAY_ACTIONS, type Action } from "@mmx/engine";
import type { ClientSettings, KeyBindings } from "./types.js";
import { DEFAULT_WINDOW_SCALE, SETTINGS_VERSION } from "./types.js";

export const BINDABLE_ACTIONS: readonly Action[] = REPLAY_ACTIONS;

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

export const DEFAULT_SETTINGS: ClientSettings = {
  version: SETTINGS_VERSION,
  audio: { masterVolume: 1 },
  input: { bindings: DEFAULT_BINDINGS },
  gameplay: { pauseOnBlur: true },
  window: {
    fullscreen: false,
    integerScale: DEFAULT_WINDOW_SCALE,
  },
};

export function cloneBindings(bindings: KeyBindings): KeyBindings {
  return Object.fromEntries(
    BINDABLE_ACTIONS.map((action) => [action, [...bindings[action]] as [string, string]]),
  ) as KeyBindings;
}

export function defaultSettings(): ClientSettings {
  return {
    version: SETTINGS_VERSION,
    audio: { masterVolume: DEFAULT_SETTINGS.audio.masterVolume },
    input: { bindings: cloneBindings(DEFAULT_BINDINGS) },
    gameplay: { pauseOnBlur: DEFAULT_SETTINGS.gameplay.pauseOnBlur },
    window: { ...DEFAULT_SETTINGS.window },
  };
}

export function cloneSettings(settings: ClientSettings): ClientSettings {
  return {
    version: SETTINGS_VERSION,
    audio: { ...settings.audio },
    input: { bindings: cloneBindings(settings.input.bindings) },
    gameplay: { ...settings.gameplay },
    window: { ...settings.window },
  };
}

export function mergeBindings(value: unknown): KeyBindings {
  const existing = (value && typeof value === "object" ? value : {}) as Partial<
    Record<Action, unknown>
  >;
  return Object.fromEntries(
    BINDABLE_ACTIONS.map((action) => {
      const slots = existing[action];
      const valid =
        Array.isArray(slots) && slots.length === 2 && slots.every((s) => typeof s === "string");
      return [action, valid ? [...(slots as [string, string])] : [...DEFAULT_BINDINGS[action]]];
    }),
  ) as KeyBindings;
}

export function resolveBindingConflict(
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

export function resetBindings(): KeyBindings {
  return cloneBindings(DEFAULT_BINDINGS);
}
