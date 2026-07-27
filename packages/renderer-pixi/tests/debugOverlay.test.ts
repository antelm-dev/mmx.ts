import assert from "node:assert/strict";
import { test } from "node:test";
import { Scene } from "@mmx/engine";
import {
  anyDebugRenderOption,
  DEBUG_RENDER_OPTIONS_OFF,
  mergeDebugRenderOptions,
  type DebugGeometryOverlay,
  type DebugRenderOptions,
} from "../src/debug/options.js";
import {
  createScenePresentationWithHost,
  type ScenePresentationHost,
} from "../src/presentation/ScenePresentation.js";
import type { AssetCatalog } from "../src/editor/catalogCore.js";
import { testLevel } from "./testLevel.js";

function mockCatalog(): AssetCatalog {
  return {
    get loaded() {
      return true;
    },
    load: async () => {},
    getSpritePreview: () => null,
    getDecorationPreview: () => null,
    attachPlayerAnimations() {},
    attachEnemyAnimations() {},
    attachLifeCapsuleAnimations() {},
    attachWeaponCapsuleAnimations() {},
  };
}

function mockHost(): ScenePresentationHost {
  return {
    setStage() {},
    render() {},
    destroy() {},
    fit() {},
    setDecorations() {},
    pixelScale: 2,
    stats: () => ({}),
    uiLayer: {} as ScenePresentationHost["uiLayer"],
    worldOverlay: {} as ScenePresentationHost["worldOverlay"],
  };
}

function stubOverlay() {
  let current: DebugRenderOptions = { ...DEBUG_RENDER_OPTIONS_OFF };
  const updates: Scene[] = [];
  let resets = 0;
  let destroys = 0;
  const overlay: DebugGeometryOverlay = {
    view: {},
    options: () => ({ ...current }),
    setOptions(patch) {
      current = mergeDebugRenderOptions(current, patch);
    },
    update(scene, options = current) {
      current = options;
      updates.push(scene);
    },
    reset() {
      resets += 1;
    },
    destroy() {
      destroys += 1;
    },
  };
  return {
    overlay,
    updates,
    getResets: () => resets,
    getDestroys: () => destroys,
    getCurrent: () => current,
  };
}

test("mergeDebugRenderOptions patches independently", () => {
  const merged = mergeDebugRenderOptions(DEBUG_RENDER_OPTIONS_OFF, {
    collisionGeometry: true,
    spriteBounds: true,
  });
  assert.deepEqual(merged, {
    collisionGeometry: true,
    actorBounds: false,
    sensors: false,
    projectiles: false,
    cameraZones: false,
    spriteBounds: true,
  });
  assert.equal(anyDebugRenderOption(DEBUG_RENDER_OPTIONS_OFF), false);
  assert.equal(anyDebugRenderOption(merged), true);
});

test("setDebugOptions is independent per flag and render updates the overlay", () => {
  const scene = Scene.create({ level: testLevel(), seed: 20 });
  const stub = stubOverlay();
  const presentation = createScenePresentationWithHost(mockHost(), scene, {
    assets: mockCatalog(),
    debugOverlay: stub.overlay,
  });

  presentation.setDebugOptions({ projectiles: true });
  assert.deepEqual(presentation.debugOptions(), {
    ...DEBUG_RENDER_OPTIONS_OFF,
    projectiles: true,
  });

  presentation.setDebugOptions({ actorBounds: true });
  assert.equal(presentation.debugOptions().projectiles, true);
  assert.equal(presentation.debugOptions().actorBounds, true);
  assert.equal(presentation.debugOptions().sensors, false);

  presentation.render(scene);
  assert.equal(stub.updates.length, 1);
  assert.equal(stub.updates[0], scene);

  presentation.destroy();
  assert.equal(stub.getDestroys(), 1);
});

test("debug overlay update path does not mutate scene digest", () => {
  const scene = Scene.create({ level: testLevel(), seed: 21 });
  const before = scene.digest();
  const stub = stubOverlay();
  const presentation = createScenePresentationWithHost(mockHost(), scene, {
    assets: mockCatalog(),
    debugOverlay: stub.overlay,
  });

  presentation.setDebugOptions({
    collisionGeometry: true,
    actorBounds: true,
    sensors: true,
    projectiles: true,
    cameraZones: true,
    spriteBounds: true,
  });
  presentation.render(scene);
  assert.equal(scene.digest(), before);

  presentation.destroy();
});

test("rebinding resets the debug overlay", () => {
  const first = Scene.create({ level: testLevel(), seed: 22 });
  const second = Scene.create({ level: testLevel(), seed: 23 });
  const stub = stubOverlay();
  const presentation = createScenePresentationWithHost(mockHost(), first, {
    assets: mockCatalog(),
    debugOverlay: stub.overlay,
  });

  const afterCreate = stub.getResets();
  presentation.bindScene(second);
  assert.equal(stub.getResets(), afterCreate + 1);

  presentation.destroy();
});
