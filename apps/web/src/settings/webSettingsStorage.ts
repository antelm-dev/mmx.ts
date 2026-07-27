import { parseSettings, type ClientSettings, type SettingsStorage } from "@mmx/client-settings";

export const WEB_SETTINGS_STORAGE_KEY = "mmx.desktop-settings.v1";

export interface WebSettingsBackend {
  loadRaw(): Promise<unknown>;
  saveRaw(settings: ClientSettings): Promise<void>;
}

export function createWebSettingsStorage(backend: WebSettingsBackend): SettingsStorage {
  return {
    async load(): Promise<unknown> {
      try {
        return await backend.loadRaw();
      } catch (error) {
        console.warn("Could not load desktop settings; using defaults", error);
        return null;
      }
    },
    async save(value: ClientSettings): Promise<void> {
      await backend.saveRaw(value);
    },
  };
}

export function readBrowserSettingsRaw(storage: Storage = localStorage): unknown {
  const text = storage.getItem(WEB_SETTINGS_STORAGE_KEY);
  if (text == null) return null;
  return JSON.parse(text) as unknown;
}

export function writeBrowserSettings(
  settings: ClientSettings,
  storage: Storage = localStorage,
): void {
  storage.setItem(WEB_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function migrateWebLegacyDocument(raw: unknown): ClientSettings {
  return parseSettings(raw);
}
