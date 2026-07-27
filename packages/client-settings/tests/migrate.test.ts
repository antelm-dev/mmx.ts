import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_BINDINGS,
  DEFAULT_SETTINGS,
  DEFAULT_WINDOW_SCALE,
  SETTINGS_VERSION,
  SettingsParseError,
  cloneBindings,
  clampScale,
  clampVolume,
  defaultSettings,
  isClientSettings,
  migrateSettings,
  normalizeSettings,
  parseSettings,
} from "../src/index.js";

test("defaults match the published schema", () => {
  const settings = defaultSettings();
  assert.equal(settings.version, SETTINGS_VERSION);
  assert.equal(settings.audio.masterVolume, 1);
  assert.equal(settings.window.integerScale, DEFAULT_WINDOW_SCALE);
  assert.equal(settings.window.fullscreen, false);
  assert.equal(settings.gameplay.pauseOnBlur, true);
  assert.deepEqual(settings.input.bindings.move_left, ["ArrowLeft", "KeyA"]);
  assert.ok(isClientSettings(settings));
});

test("valid current document round-trips through migrate", () => {
  const current = defaultSettings();
  current.audio.masterVolume = 0.4;
  current.window.integerScale = 2;
  const migrated = migrateSettings(current);
  assert.equal(migrated.audio.masterVolume, 0.4);
  assert.equal(migrated.window.integerScale, 2);
});

test("migration v1 to v2 adds default bindings without dropping volume", () => {
  const v1 = {
    version: 1,
    masterVolume: 0.25,
    fullscreen: true,
    pauseOnBlur: false,
  };
  const step = migrateSettings({ ...v1, version: 1 });
  assert.equal(step.audio.masterVolume, 0.25);
  assert.equal(step.window.fullscreen, true);
  assert.equal(step.gameplay.pauseOnBlur, false);
  assert.deepEqual(step.input.bindings.jump, DEFAULT_BINDINGS.jump);
});

test("migration v2 to v3 merges weapon bindings", () => {
  const v2 = {
    version: 2,
    masterVolume: 0.5,
    scale: 4,
    fullscreen: false,
    pauseOnBlur: true,
    bindings: {
      move_left: ["ArrowLeft", "KeyA"],
      move_right: ["ArrowRight", "KeyD"],
      move_up: ["ArrowUp", "KeyW"],
      move_down: ["ArrowDown", "KeyS"],
      jump: ["Space", "KeyZ"],
      dash: ["ShiftLeft", "KeyL"],
      fire: ["KeyJ", "KeyF"],
    },
  };
  const migrated = migrateSettings(v2);
  assert.equal(migrated.version, SETTINGS_VERSION);
  assert.deepEqual(migrated.input.bindings.jump, ["Space", "KeyZ"]);
  assert.deepEqual(migrated.input.bindings.weapon_left, DEFAULT_BINDINGS.weapon_left);
  assert.deepEqual(migrated.input.bindings.weapon_right, DEFAULT_BINDINGS.weapon_right);
  assert.equal(migrated.window.integerScale, 4);
});

test("migration v3 flat becomes structured v4", () => {
  const v3 = {
    version: 3,
    masterVolume: 0.7,
    scale: 5,
    fullscreen: true,
    pauseOnBlur: false,
    bindings: cloneBindings(DEFAULT_BINDINGS),
  };
  const migrated = migrateSettings(v3);
  assert.equal(migrated.version, 4);
  assert.equal(migrated.audio.masterVolume, 0.7);
  assert.equal(migrated.window.integerScale, 5);
  assert.equal(migrated.window.fullscreen, true);
  assert.equal(migrated.gameplay.pauseOnBlur, false);
});

test("malformed values fall back to defaults via parseSettings", () => {
  assert.deepEqual(parseSettings({ version: 3, masterVolume: "loud" }).audio, DEFAULT_SETTINGS.audio);
  assert.equal(parseSettings("nope").version, SETTINGS_VERSION);
});

test("future versions fail safely", () => {
  assert.throws(
    () => migrateSettings({ version: 99, audio: { masterVolume: 1 } }),
    (error: unknown) => error instanceof SettingsParseError && /newer than supported/.test(error.message),
  );
  assert.throws(() => parseSettings({ version: SETTINGS_VERSION + 1 }), SettingsParseError);
});

test("volume and scale clamping", () => {
  assert.equal(clampVolume(2), 1);
  assert.equal(clampVolume(-1), 0);
  assert.equal(clampVolume(Number.NaN), 1);
  assert.equal(clampScale(0), 1);
  assert.equal(clampScale(99), 8);
  assert.equal(clampScale(3.6), 4);
  const normalized = normalizeSettings({
    ...defaultSettings(),
    audio: { masterVolume: 4 },
    window: { fullscreen: false, integerScale: 0 },
  });
  assert.equal(normalized.audio.masterVolume, 1);
  assert.equal(normalized.window.integerScale, 1);
});
