import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createClientSettingsStore,
  defaultSettings,
  type ClientSettings,
  type SettingsStorage,
  type SettingsTimers,
} from "../src/index.js";

class MemoryStorage implements SettingsStorage {
  value: unknown = null;
  saves: ClientSettings[] = [];
  failNext = false;
  saveDelayMs = 0;

  async load(): Promise<unknown> {
    return this.value;
  }

  async save(value: ClientSettings): Promise<void> {
    if (this.saveDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.saveDelayMs));
    }
    if (this.failNext) {
      this.failNext = false;
      throw new Error("disk full");
    }
    this.saves.push(value);
    this.value = value;
  }
}

class ManualTimers implements SettingsTimers {
  private nextId = 1;
  private readonly pending = new Map<number, () => void>();

  setTimeout(handler: () => void): unknown {
    const id = this.nextId++;
    this.pending.set(id, handler);
    return id;
  }

  clearTimeout(id: unknown): void {
    this.pending.delete(id as number);
  }

  flush(): void {
    const handlers = [...this.pending.values()];
    this.pending.clear();
    for (const handler of handlers) handler();
  }

  get size(): number {
    return this.pending.size;
  }
}

test("immutable patching and snapshots", async () => {
  const storage = new MemoryStorage();
  const store = createClientSettingsStore({ storage, debounceMs: 0, timers: new ManualTimers() });
  await store.load();
  const before = store.snapshot();
  store.patch({ audio: { masterVolume: 0.3 } });
  before.audio.masterVolume = 0;
  before.input.bindings.jump[0] = "KeyZ";
  assert.equal(store.snapshot().audio.masterVolume, 0.3);
  assert.equal(store.snapshot().input.bindings.jump[0], "Space");
});

test("debounce coalescing", async () => {
  const storage = new MemoryStorage();
  const timers = new ManualTimers();
  const store = createClientSettingsStore({ storage, debounceMs: 200, timers });
  await store.load();
  store.patch({ audio: { masterVolume: 0.1 } });
  store.patch({ audio: { masterVolume: 0.2 } });
  store.patch({ audio: { masterVolume: 0.3 } });
  assert.equal(storage.saves.length, 0);
  assert.equal(timers.size, 1);
  timers.flush();
  await store.flush();
  assert.equal(storage.saves.length, 1);
  assert.equal(storage.saves[0]?.audio.masterVolume, 0.3);
});

test("flush and dispose persist pending writes", async () => {
  const storage = new MemoryStorage();
  const timers = new ManualTimers();
  const store = createClientSettingsStore({ storage, timers });
  await store.load();
  store.patch({ gameplay: { pauseOnBlur: false } });
  await store.flush();
  assert.equal(storage.saves.at(-1)?.gameplay.pauseOnBlur, false);

  store.patch({ window: { fullscreen: true } });
  await store.dispose();
  assert.equal(storage.saves.at(-1)?.window.fullscreen, true);
  assert.throws(() => store.patch({ audio: { masterVolume: 0.5 } }));
});

test("save failure reporting", async () => {
  const storage = new MemoryStorage();
  const timers = new ManualTimers();
  const errors: unknown[] = [];
  const store = createClientSettingsStore({
    storage,
    timers,
    onSaveError: (error) => errors.push(error),
  });
  await store.load();
  storage.failNext = true;
  store.patch({ audio: { masterVolume: 0.55 } });
  timers.flush();
  await assert.rejects(() => store.flush());
  assert.equal(errors.length, 1);
});

test("overlapping saves keep newest snapshot", async () => {
  const storage = new MemoryStorage();
  storage.saveDelayMs = 20;
  const timers = new ManualTimers();
  const store = createClientSettingsStore({ storage, timers, debounceMs: 0 });
  await store.load();

  store.patch({ audio: { masterVolume: 0.1 } });
  timers.flush();
  const first = store.flush();
  store.patch({ audio: { masterVolume: 0.9 } });
  timers.flush();
  await store.flush();
  await first.catch(() => undefined);

  assert.equal(storage.saves.at(-1)?.audio.masterVolume, 0.9);
  assert.ok(storage.saves.every((save, index, all) => {
    if (index === 0) return true;
    return save.audio.masterVolume >= (all[index - 1]?.audio.masterVolume ?? 0) ||
      save.audio.masterVolume === 0.9;
  }));
});

test("observer subscribe and unsubscribe", async () => {
  const storage = new MemoryStorage();
  const store = createClientSettingsStore({
    storage,
    timers: new ManualTimers(),
  });
  await store.load();
  const seen: number[] = [];
  const stop = store.subscribe((settings) => seen.push(settings.audio.masterVolume));
  store.patch({ audio: { masterVolume: 0.2 } });
  stop();
  store.patch({ audio: { masterVolume: 0.4 } });
  assert.deepEqual(seen, [0.2]);
});

test("setBinding and resetBindings", async () => {
  const storage = new MemoryStorage();
  const timers = new ManualTimers();
  const store = createClientSettingsStore({ storage, timers });
  await store.load();
  store.setBinding("fire", 0, "KeyA");
  assert.equal(store.snapshot().input.bindings.fire[0], "KeyA");
  assert.equal(store.snapshot().input.bindings.move_left[1], "");
  store.resetBindings();
  assert.deepEqual(store.snapshot().input.bindings, defaultSettings().input.bindings);
  timers.flush();
  await store.flush();
});
