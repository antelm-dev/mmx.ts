import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlayerRuntime } from "../src/player/createPlayerRuntime.js";
import { createToolingRuntime } from "../src/tooling/createToolingRuntime.js";
import { RuntimeSession } from "../src/core/RuntimeSession.js";
import type { RuntimePresentation } from "../src/core/types.js";
import type { Scene } from "@mmx/engine";

const SEED = 42;

test("player and tooling facades match for the same seed and masks", () => {
  const player = createPlayerRuntime({ scene: { seed: SEED } });
  const tooling = createToolingRuntime({ scene: { seed: SEED } });
  const masks = [0, 1 << 1, 1 << 4, (1 << 1) | (1 << 4), 0, 1 << 5];

  for (const mask of masks) {
    player.step(mask);
    tooling.step(mask);
  }

  assert.equal(player.inspect().frame, tooling.inspect().frame);
  assert.equal(player.inspect().simulation.digest, tooling.inspect().simulation.digest);

  player.dispose();
  tooling.dispose();
});

test("pause blocks automatic stepping while manual step remains deterministic", async () => {
  const tooling = createToolingRuntime({ scene: { seed: SEED } });
  tooling.step(0);
  tooling.step(0);
  assert.equal(tooling.inspect().frame, 2);

  const listeners = new Map<string, Set<(e: unknown) => void>>();
  (globalThis as { window?: unknown }).window = {
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(fn);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, fn: (e: unknown) => void) => {
      listeners.get(type)?.delete(fn);
    },
  };

  let now = 0;
  const pending: FrameRequestCallback[] = [];
  (globalThis as { requestAnimationFrame: typeof requestAnimationFrame }).requestAnimationFrame = (
    cb,
  ) => {
    pending.push(cb);
    return pending.length;
  };
  (globalThis as { cancelAnimationFrame: typeof cancelAnimationFrame }).cancelAnimationFrame =
    () => {
      pending.length = 0;
    };
  Object.defineProperty(globalThis.performance, "now", {
    configurable: true,
    value: () => now,
  });

  await tooling.startBrowser();
  tooling.pause();
  assert.equal(tooling.isPaused, true);

  now += 1000;
  const batch = pending.splice(0);
  for (const cb of batch) cb(now);
  assert.equal(tooling.inspect().frame, 2);

  tooling.setAction("move_right", true);
  tooling.step();
  assert.equal(tooling.inspect().frame, 3);

  tooling.dispose();
  Reflect.deleteProperty(globalThis, "window");
});

test("scene replacement rebinds presentation and audio", () => {
  const binds: Scene[] = [];
  const audioScenes: Scene[] = [];
  const presentation: RuntimePresentation = {
    bindScene: (scene) => {
      binds.push(scene);
    },
  };
  const session = new RuntimeSession({
    scene: { seed: SEED },
    presentation,
    audio: {
      attachScene: (scene) => {
        audioScenes.push(scene);
      },
      stop() {},
    },
  });

  assert.equal(binds.length, 1);
  assert.equal(audioScenes.length, 1);

  session.step(0);
  session.setCheckpoint();
  session.step(0);
  session.restartCheckpoint();

  assert.ok(binds.length >= 2);
  assert.ok(audioScenes.length >= 2);
  assert.equal(session.inspect().frame, 1);

  session.dispose();
});

test("checkpoint restart restores deterministic state", () => {
  const a = createToolingRuntime({ scene: { seed: SEED } });
  const b = createToolingRuntime({ scene: { seed: SEED } });

  for (let i = 0; i < 5; i++) {
    a.step(1 << 1);
    b.step(1 << 1);
  }
  a.setCheckpoint();
  b.setCheckpoint();

  for (let i = 0; i < 3; i++) a.step(1 << 4);
  a.restartCheckpoint();

  assert.equal(a.inspect().frame, b.inspect().frame);
  assert.equal(a.inspect().simulation.digest, b.inspect().simulation.digest);

  a.dispose();
  b.dispose();
});

test("headless createPlayerRuntime does not need DOM globals", () => {
  const hadWindow = "window" in globalThis;
  const hadRaf = "requestAnimationFrame" in globalThis;
  if (hadWindow) Reflect.deleteProperty(globalThis, "window");
  if (hadRaf) Reflect.deleteProperty(globalThis, "requestAnimationFrame");

  const runtime = createPlayerRuntime({ scene: { seed: SEED } });
  runtime.step(0);
  assert.equal(runtime.inspect().frame, 1);
  runtime.dispose();

  assert.equal("window" in globalThis, hadWindow);
});
