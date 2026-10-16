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

// Outside ClientSettings on purpose: that schema is shared with the engine and drops unknown keys.
export const NOTICE_SEEN_KEY = "mmx.studio-notice-seen.v1";

export function hasSeenNotice(storage: Pick<Storage, "getItem"> = localStorage): boolean {
  try {
    return storage.getItem(NOTICE_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markNoticeSeen(storage: Pick<Storage, "setItem"> = localStorage): void {
  try {
    storage.setItem(NOTICE_SEEN_KEY, "1");
  } catch {
    /* storage unavailable: the notice shows again next launch, which is harmless */
  }
}

export const SHOW_START_PAGE_KEY = "mmx.studio-show-start-page.v1";

/** Help → Start Page's "Show at launch" preference; on unless turned off. */
export function showStartPageAtLaunch(storage: Pick<Storage, "getItem"> = localStorage): boolean {
  try {
    return storage.getItem(SHOW_START_PAGE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function setShowStartPageAtLaunch(
  show: boolean,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  try {
    storage.setItem(SHOW_START_PAGE_KEY, String(show));
  } catch {
    /* storage unavailable: the default (shown) applies next launch */
  }
}
