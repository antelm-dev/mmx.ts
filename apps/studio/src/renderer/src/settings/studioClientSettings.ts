import {
  createClientSettingsStore,
  type ClientSettings,
  type ClientSettingsStore,
  type SettingsStorage,
} from "@mmx/client-settings";

export const STUDIO_CLIENT_SETTINGS_KEY = "mmx.studio-client-settings.v1";

export function createStudioSettingsStorage(
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
): SettingsStorage {
  return {
    async load(): Promise<unknown> {
      try {
        const text = storage.getItem(STUDIO_CLIENT_SETTINGS_KEY);
        if (text == null) return null;
        return JSON.parse(text) as unknown;
      } catch {
        return null;
      }
    },
    async save(value: ClientSettings): Promise<void> {
      storage.setItem(STUDIO_CLIENT_SETTINGS_KEY, JSON.stringify(value));
    },
  };
}

let store: ClientSettingsStore | null = null;
let loadPromise: Promise<ClientSettingsStore> | null = null;

export function getStudioClientSettingsStore(): ClientSettingsStore {
  if (!store) {
    throw new Error("studio client settings store has not been initialized");
  }
  return store;
}

export function createStudioClientSettingsStore(
  onSaveError?: (message: string) => void,
): ClientSettingsStore {
  return createClientSettingsStore({
    storage: createStudioSettingsStorage(),
    onSaveError: (error) => {
      onSaveError?.(
        `settings save failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    },
  });
}

export function initStudioClientSettings(
  onError?: (message: string) => void,
): Promise<ClientSettingsStore> {
  if (loadPromise) return loadPromise;
  store = createStudioClientSettingsStore(onError);
  loadPromise = store
    .load()
    .then(() => store!)
    .catch((error: unknown) => {
      onError?.(`settings load failed: ${error instanceof Error ? error.message : String(error)}`);
      return store!;
    });
  return loadPromise;
}

export async function ensureStudioClientSettings(): Promise<ClientSettingsStore> {
  return initStudioClientSettings();
}
