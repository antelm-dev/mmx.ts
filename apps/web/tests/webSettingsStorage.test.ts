import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createClientSettingsStore,
  DEFAULT_BINDINGS,
  SETTINGS_VERSION,
} from "@mmx/client-settings";
import {
  createWebSettingsStorage,
  migrateWebLegacyDocument,
  WEB_SETTINGS_STORAGE_KEY,
  writeBrowserSettings,
} from "../src/settings/webSettingsStorage.ts";

test("web legacy localStorage documents migrate through the shared store", async () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  } as Storage;

  storage.setItem(
    WEB_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      version: 2,
      masterVolume: 0.35,
      fullscreen: true,
      pauseOnBlur: false,
      bindings: {
        move_left: ["ArrowLeft", "KeyA"],
        move_right: ["ArrowRight", "KeyD"],
        move_up: ["ArrowUp", "KeyW"],
        move_down: ["ArrowDown", "KeyS"],
        jump: ["Space", "KeyZ"],
        dash: ["ShiftLeft", "KeyL"],
        fire: ["KeyJ", "KeyF"],
      },
    }),
  );

  const backend = {
    async loadRaw() {
      const text = storage.getItem(WEB_SETTINGS_STORAGE_KEY);
      return text == null ? null : JSON.parse(text);
    },
    async saveRaw(settings) {
      writeBrowserSettings(settings, storage);
    },
  };

  const store = createClientSettingsStore({
    storage: createWebSettingsStorage(backend),
    debounceMs: 0,
    timers: {
      setTimeout: (handler) => {
        handler();
        return 0;
      },
      clearTimeout: () => undefined,
    },
  });

  const loaded = await store.load();
  assert.equal(loaded.version, SETTINGS_VERSION);
  assert.equal(loaded.audio.masterVolume, 0.35);
  assert.equal(loaded.window.fullscreen, true);
  assert.equal(loaded.gameplay.pauseOnBlur, false);
  assert.deepEqual(loaded.input.bindings.jump, ["Space", "KeyZ"]);
  assert.deepEqual(loaded.input.bindings.weapon_left, DEFAULT_BINDINGS.weapon_left);

  store.patch({ audio: { masterVolume: 0.5 } });
  await store.flush();
  const persisted = migrateWebLegacyDocument(JSON.parse(memory.get(WEB_SETTINGS_STORAGE_KEY)!));
  assert.equal(persisted.audio.masterVolume, 0.5);
  assert.equal(persisted.version, SETTINGS_VERSION);
});
