import type { Action } from "@mmx/engine";
import {
  cloneBindings,
  cloneSettings,
  defaultSettings,
  mergeBindings,
  resolveBindingConflict,
  resetBindings,
} from "./bindings.js";
import { clampScale, clampVolume, normalizeSettings, parseSettings } from "./normalize.js";
import type {
  ClientSettings,
  ClientSettingsStore,
  CreateClientSettingsStoreOptions,
  DeepPartial,
  SettingsTimers,
} from "./types.js";
import { DEFAULT_PERSIST_DEBOUNCE_MS, SETTINGS_VERSION } from "./types.js";

const defaultTimers: SettingsTimers = {
  setTimeout: (handler, ms) => setTimeout(handler, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

function mergeDeep(base: ClientSettings, update: DeepPartial<ClientSettings>): ClientSettings {
  const next = cloneSettings(base);
  if (update.audio?.masterVolume !== undefined) {
    next.audio.masterVolume = clampVolume(update.audio.masterVolume);
  }
  if (update.gameplay?.pauseOnBlur !== undefined) {
    next.gameplay.pauseOnBlur = update.gameplay.pauseOnBlur;
  }
  if (update.window) {
    if (update.window.fullscreen !== undefined) {
      next.window.fullscreen = update.window.fullscreen;
    }
    if (update.window.integerScale !== undefined) {
      next.window.integerScale = clampScale(update.window.integerScale);
    }
  }
  if (update.input?.bindings) {
    next.input.bindings = cloneBindings(mergeBindings(update.input.bindings));
  }
  next.version = SETTINGS_VERSION;
  return normalizeSettings(next);
}

export function createClientSettingsStore(
  options: CreateClientSettingsStoreOptions,
): ClientSettingsStore {
  const timers = options.timers ?? defaultTimers;
  const debounceMs = options.debounceMs ?? DEFAULT_PERSIST_DEBOUNCE_MS;

  let settings = defaultSettings();
  let disposed = false;
  let timer: unknown = null;
  let pending: ClientSettings | null = null;
  let writeChain: Promise<void> = Promise.resolve();
  let writeEpoch = 0;
  const listeners = new Set<(settings: ClientSettings) => void>();

  const emit = (): void => {
    const snap = cloneSettings(settings);
    for (const listener of listeners) listener(snap);
  };

  const schedulePersist = (): void => {
    if (disposed) return;
    pending = cloneSettings(settings);
    if (timer != null) timers.clearTimeout(timer);
    timer = timers.setTimeout(() => {
      timer = null;
      void persistNow();
    }, debounceMs);
  };

  const persistNow = (): Promise<void> => {
    if (pending == null) return writeChain;
    const toSave = pending;
    pending = null;
    if (timer != null) {
      timers.clearTimeout(timer);
      timer = null;
    }
    const epoch = ++writeEpoch;
    writeChain = writeChain
      .catch(() => undefined)
      .then(async () => {
        if (epoch !== writeEpoch) return;
        try {
          await options.storage.save(cloneSettings(toSave));
        } catch (error) {
          options.onSaveError?.(error, cloneSettings(toSave));
          throw error;
        }
      });
    return writeChain;
  };

  return {
    async load(): Promise<ClientSettings> {
      if (disposed) throw new Error("client-settings: store disposed");
      const raw = await options.storage.load();
      settings = parseSettings(raw);
      emit();
      return cloneSettings(settings);
    },

    snapshot(): ClientSettings {
      return cloneSettings(settings);
    },

    patch(update: DeepPartial<ClientSettings>): void {
      if (disposed) throw new Error("client-settings: store disposed");
      settings = mergeDeep(settings, update);
      emit();
      schedulePersist();
    },

    setBinding(action: Action, slot: number, code: string): void {
      if (disposed) throw new Error("client-settings: store disposed");
      settings = {
        ...settings,
        input: {
          bindings: resolveBindingConflict(settings.input.bindings, action, slot, code),
        },
      };
      emit();
      schedulePersist();
    },

    resetBindings(): void {
      if (disposed) throw new Error("client-settings: store disposed");
      settings = {
        ...settings,
        input: { bindings: resetBindings() },
      };
      emit();
      schedulePersist();
    },

    subscribe(listener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async flush(): Promise<void> {
      if (disposed) throw new Error("client-settings: store disposed");
      await persistNow();
    },

    async dispose(): Promise<void> {
      if (disposed) return;
      await persistNow();
      disposed = true;
      listeners.clear();
    },
  };
}

export type { ClientSettingsStore };
