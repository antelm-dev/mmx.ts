import assert from "node:assert/strict";
import { test } from "node:test";

test("headless import has no browser globals at evaluation time", async () => {
  const previousWindow = (globalThis as { window?: unknown }).window;
  const previousDocument = (globalThis as { document?: unknown }).document;
  const previousLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;

  Reflect.deleteProperty(globalThis, "window");
  Reflect.deleteProperty(globalThis, "document");
  Reflect.deleteProperty(globalThis, "localStorage");

  try {
    const mod = await import(`../src/index.js?headless=${Date.now()}`);
    assert.equal(typeof mod.createClientSettingsStore, "function");
    assert.equal(typeof mod.parseSettings, "function");
    assert.equal(mod.SETTINGS_VERSION, 4);
    assert.equal(typeof mod.defaultSettings, "function");
  } finally {
    if (previousWindow !== undefined) (globalThis as { window?: unknown }).window = previousWindow;
    if (previousDocument !== undefined) {
      (globalThis as { document?: unknown }).document = previousDocument;
    }
    if (previousLocalStorage !== undefined) {
      (globalThis as { localStorage?: unknown }).localStorage = previousLocalStorage;
    }
  }
});
