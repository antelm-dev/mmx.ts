import type { ClientSettings, KeyBindings } from "./types.js";
import { DEFAULT_WINDOW_SCALE, MAX_WINDOW_SCALE, SETTINGS_VERSION } from "./types.js";
import {
  BINDABLE_ACTIONS,
  cloneBindings,
  cloneSettings,
  defaultSettings,
  mergeBindings,
} from "./bindings.js";

export function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.max(0, Math.min(1, volume));
}

export function clampScale(scale: number, max = MAX_WINDOW_SCALE): number {
  if (!Number.isFinite(scale)) return DEFAULT_WINDOW_SCALE;
  return Math.max(1, Math.min(max, Math.round(scale)));
}

function validBindings(value: unknown): value is KeyBindings {
  if (!value || typeof value !== "object") return false;
  const bindings = value as Record<string, unknown>;
  if (Object.keys(bindings).length !== BINDABLE_ACTIONS.length) return false;
  return BINDABLE_ACTIONS.every((action) => {
    const slots = bindings[action];
    return Array.isArray(slots) && slots.length === 2 && slots.every((s) => typeof s === "string");
  });
}

export function isClientSettings(value: unknown): value is ClientSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as Partial<ClientSettings>;
  if (settings.version !== SETTINGS_VERSION) return false;
  if (!settings.audio || typeof settings.audio !== "object") return false;
  if (!settings.input || typeof settings.input !== "object") return false;
  if (!settings.gameplay || typeof settings.gameplay !== "object") return false;
  if (!settings.window || typeof settings.window !== "object") return false;

  const { masterVolume } = settings.audio as { masterVolume?: unknown };
  const { pauseOnBlur } = settings.gameplay as { pauseOnBlur?: unknown };
  const { fullscreen, integerScale } = settings.window as {
    fullscreen?: unknown;
    integerScale?: unknown;
  };
  const bindings = (settings.input as { bindings?: unknown }).bindings;

  const scaleOk =
    typeof integerScale === "number" &&
    Number.isInteger(integerScale) &&
    integerScale >= 1 &&
    integerScale <= MAX_WINDOW_SCALE;

  return (
    typeof masterVolume === "number" &&
    Number.isFinite(masterVolume) &&
    masterVolume >= 0 &&
    masterVolume <= 1 &&
    typeof pauseOnBlur === "boolean" &&
    typeof fullscreen === "boolean" &&
    scaleOk &&
    validBindings(bindings)
  );
}

export function normalizeSettings(
  settings: ClientSettings,
  maxScale = MAX_WINDOW_SCALE,
): ClientSettings {
  const next = cloneSettings(settings);
  next.audio.masterVolume = clampVolume(next.audio.masterVolume);
  next.window.integerScale = clampScale(next.window.integerScale, maxScale);
  next.input.bindings = cloneBindings(next.input.bindings);
  return next;
}

type FlatLegacy = {
  version: number;
  masterVolume: number;
  scale?: number;
  fullscreen: boolean;
  pauseOnBlur: boolean;
  bindings: unknown;
};

function isFlatLegacy(
  value: Record<string, unknown>,
): value is FlatLegacy & Record<string, unknown> {
  return (
    typeof value.masterVolume === "number" &&
    typeof value.fullscreen === "boolean" &&
    typeof value.pauseOnBlur === "boolean" &&
    !("audio" in value)
  );
}

function flatToStructured(flat: FlatLegacy): ClientSettings {
  return {
    version: SETTINGS_VERSION,
    audio: { masterVolume: clampVolume(flat.masterVolume) },
    input: { bindings: mergeBindings(flat.bindings) },
    gameplay: { pauseOnBlur: flat.pauseOnBlur },
    window: {
      fullscreen: flat.fullscreen,
      integerScale: clampScale(flat.scale ?? DEFAULT_WINDOW_SCALE),
    },
  };
}

type Migration = (value: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, Migration> = {
  1: (settings) => ({
    ...settings,
    version: 2,
    bindings: cloneBindings(mergeBindings(undefined)),
  }),
  2: (settings) => ({
    ...settings,
    version: 3,
    bindings: mergeBindings(settings.bindings),
  }),
  3: (settings) => {
    if (!isFlatLegacy(settings)) {
      throw new Error(
        "client-settings: version 3 document is not a recognized flat settings shape",
      );
    }
    return flatToStructured(settings) as unknown as Record<string, unknown>;
  },
};

export class SettingsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsParseError";
  }
}

export function migrateSettings(raw: unknown): ClientSettings {
  if (raw == null) return defaultSettings();
  if (typeof raw !== "object") {
    throw new SettingsParseError("client-settings: settings document must be an object");
  }

  let doc = { ...(raw as Record<string, unknown>) };
  let version = typeof doc.version === "number" ? doc.version : NaN;

  if (!Number.isInteger(version)) {
    throw new SettingsParseError("client-settings: missing or invalid settings version");
  }
  if (version > SETTINGS_VERSION) {
    throw new SettingsParseError(
      `client-settings: settings version ${version} is newer than supported ${SETTINGS_VERSION}`,
    );
  }

  while (version < SETTINGS_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      throw new SettingsParseError(`client-settings: no migration from version ${version}`);
    }
    doc = step(doc);
    version = typeof doc.version === "number" ? doc.version : version + 1;
  }

  if (!isClientSettings(doc)) {
    throw new SettingsParseError("client-settings: migrated document failed validation");
  }
  return normalizeSettings(doc);
}

export function parseSettings(raw: unknown): ClientSettings {
  try {
    return migrateSettings(raw);
  } catch (error) {
    if (error instanceof SettingsParseError && /newer than supported/.test(error.message)) {
      throw error;
    }
    return defaultSettings();
  }
}
