import type { Action } from "@mmx/engine";

export const SETTINGS_VERSION = 4 as const;

export const DEFAULT_WINDOW_SCALE = 3;
export const MAX_WINDOW_SCALE = 8;
export const DEFAULT_PERSIST_DEBOUNCE_MS = 200;

export type KeyBindings = Record<Action, [string, string]>;

export interface ClientSettings {
  version: typeof SETTINGS_VERSION;
  audio: {
    masterVolume: number;
  };
  input: {
    bindings: KeyBindings;
  };
  gameplay: {
    pauseOnBlur: boolean;
  };
  window: {
    fullscreen: boolean;
    integerScale: number;
  };
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[]
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export interface SettingsStorage {
  load(): Promise<unknown>;
  save(value: ClientSettings): Promise<void>;
}

export type SettingsSaveErrorHandler = (error: unknown, settings: ClientSettings) => void;

export interface SettingsTimers {
  setTimeout(handler: () => void, ms: number): unknown;
  clearTimeout(id: unknown): void;
}

export interface CreateClientSettingsStoreOptions {
  storage: SettingsStorage;
  debounceMs?: number;
  timers?: SettingsTimers;
  onSaveError?: SettingsSaveErrorHandler;
}

export interface ClientSettingsStore {
  load(): Promise<ClientSettings>;
  snapshot(): ClientSettings;
  patch(update: DeepPartial<ClientSettings>): void;
  setBinding(action: Action, slot: number, code: string): void;
  resetBindings(): void;
  subscribe(listener: (settings: ClientSettings) => void): () => void;
  flush(): Promise<void>;
  dispose(): Promise<void>;
}
