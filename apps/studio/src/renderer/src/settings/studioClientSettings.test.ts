import { describe, expect, it, vi } from "vitest";
import {
  createClientSettingsStore,
  DEFAULT_BINDINGS,
  SETTINGS_VERSION,
} from "@mmx/client-settings";
import { createStudioSettingsStorage, STUDIO_CLIENT_SETTINGS_KEY } from "./studioClientSettings.js";

describe("studio settings storage", () => {
  it("persists structured settings under the studio key", async () => {
    const memory = new Map<string, string>();
    const storage = createStudioSettingsStorage({
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value);
      },
    });
    const errors: string[] = [];
    const store = createClientSettingsStore({
      storage,
      debounceMs: 0,
      timers: {
        setTimeout: (handler) => {
          handler();
          return 0;
        },
        clearTimeout: () => undefined,
      },
      onSaveError: (error) => errors.push(String(error)),
    });

    await store.load();
    store.patch({
      audio: { masterVolume: 0.4 },
      gameplay: { pauseOnBlur: false },
      input: {
        bindings: {
          ...DEFAULT_BINDINGS,
          jump: ["Space", "KeyZ"],
        },
      },
    });
    await store.flush();

    expect(errors).toEqual([]);
    expect(memory.has(STUDIO_CLIENT_SETTINGS_KEY)).toBe(true);
    const raw = JSON.parse(memory.get(STUDIO_CLIENT_SETTINGS_KEY)!) as {
      version: number;
      audio: { masterVolume: number };
    };
    expect(raw.version).toBe(SETTINGS_VERSION);
    expect(raw.audio.masterVolume).toBe(0.4);

    const reloaded = createClientSettingsStore({ storage });
    const snap = await reloaded.load();
    expect(snap.audio.masterVolume).toBe(0.4);
    expect(snap.gameplay.pauseOnBlur).toBe(false);
    expect(snap.input.bindings.jump).toEqual(["Space", "KeyZ"]);
  });

  it("reports save failures", async () => {
    const onSaveError = vi.fn();
    const store = createClientSettingsStore({
      storage: {
        async load() {
          return null;
        },
        async save() {
          throw new Error("quota");
        },
      },
      debounceMs: 0,
      timers: {
        setTimeout: (handler) => {
          handler();
          return 0;
        },
        clearTimeout: () => undefined,
      },
      onSaveError,
    });
    await store.load();
    store.patch({ audio: { masterVolume: 0.2 } });
    await expect(store.flush()).rejects.toThrow(/quota/);
    expect(onSaveError).toHaveBeenCalled();
  });
});
