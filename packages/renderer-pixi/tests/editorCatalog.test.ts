import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnimData } from "@mmx/contracts/animation";
import { definitionsFromGameData } from "@mmx/content-schema";
import { LifeCapsule } from "@mmx/engine";
import { buildCompileRegistries } from "@mmx/engine/behaviors";
import { GAME_DATA, compileGameData, mergeGameData, type GameDataOverlay } from "@mmx/engine/data";
import pack from "@mmx/pack-mmx-starter/data/game.json" with { type: "json" };
import { PROJECT_SCHEMA_VERSION } from "@mmx/project-schema";
import {
  buildRendererAssetManifestFromProject,
  manifestToPreviewTables,
} from "../src/assets/manifest.js";
import { createCatalog } from "../src/editor/catalogCore.js";
import { oncePromise } from "../src/editor/once.js";
import { resolveSpriteCrop, type PreviewTables } from "../src/editor/preview.js";

function fakeTables(): PreviewTables {
  const project = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "test.project",
    name: "Test",
    gameVersion: "1.0.0",
    compatibleRuntime: { min: "1.0.0" },
    entryLevelId: "intro",
    levels: [{ id: "intro", path: "levels/intro.json" }],
    assets: [
      { id: "image.player", kind: "image", path: "sprites/player/x.png" },
      { id: "image.enemy", kind: "image", path: "sprites/enemies/metool.png" },
      { id: "image.pickup.small", kind: "image", path: "sprites/pickups/sheal.png" },
      { id: "image.pickup.large", kind: "image", path: "sprites/pickups/ammo.png" },
      {
        id: "anim.player",
        kind: "animation",
        path: "sprites/player/x_anims.json",
        sheetAssetId: "image.player",
        animations: {
          idle: {
            loop: true,
            speed: 1,
            frames: [{ region: [0, 0, 64, 56] as const, duration: 1 }],
          },
        },
      },
      {
        id: "anim.enemy.metool",
        kind: "animation",
        path: "sprites/enemies/metool_anims.json",
        sheetAssetId: "image.enemy",
        animations: {
          defense: {
            loop: true,
            speed: 1,
            frames: [{ region: [0, 0, 32, 32] as const, duration: 1 }],
          },
        },
      },
      {
        id: "anim.pickup.small",
        kind: "animation",
        path: "sprites/pickups/small_anims.json",
        sheetAssetId: "image.pickup.small",
        animations: {
          idle: {
            loop: true,
            speed: 1,
            frames: [{ region: [0, 0, 16, 16] as const, duration: 1 }],
          },
        },
      },
      {
        id: "anim.pickup.ammo",
        kind: "animation",
        path: "sprites/pickups/ammo_anims.json",
        sheetAssetId: "image.pickup.large",
        animations: {
          idle: {
            loop: true,
            speed: 1,
            frames: [{ region: [0, 0, 16, 16] as const, duration: 1 }],
          },
        },
      },
    ],
  } as const;

  const manifest = buildRendererAssetManifestFromProject(
    project,
    {
      playerAnimation: "anim.player",
      playerSheetNormal: "image.player",
      playerSheetPointing: "image.player",
      enemyActors: { metool: "anim.enemy.metool" },
      pickupActors: { sheal: "anim.pickup.small", ammo: "anim.pickup.ammo" },
      shotAnimations: "anim.player",
      sheetImages: {
        "image.player": "image.player",
        "image.enemy": "image.enemy",
        "image.pickup.small": "image.pickup.small",
        "image.pickup.large": "image.pickup.large",
      },
      hudSheets: {
        xBar: "image.player",
        hpFill: "image.player",
        weaponBar: "image.player",
      },
    },
    (asset) => `memory://${asset.path}`,
    { shotAnims: { sheets: {}, animations: {} } },
  );

  return {
    sheetUrls: manifest.sheetUrls,
    playerAnims: manifest.playerAnims,
    playerSheet: manifest.playerSheet,
    enemyActors: manifest.enemyActors,
    pickupActors: manifest.pickupActors,
  };
}

test("preview spawn uses idle first frame", () => {
  const crop = resolveSpriteCrop(
    { id: "spawn", category: "spawn", components: { player: {} } },
    fakeTables(),
  );
  assert.ok(crop);
  assert.equal(crop.imageUrl, "memory://sprites/player/x.png");
  assert.deepEqual(crop.region, fakeTables().playerAnims.animations.idle.frames[0].region);
});

test("preview Metool prefers defense", () => {
  const t = fakeTables();
  const crop = resolveSpriteCrop(
    {
      id: "enemy.metool",
      category: "enemy",
      components: { enemy: { kind: "metool" } },
    },
    t,
  );
  assert.ok(crop);
  assert.equal(crop.imageUrl, "memory://sprites/enemies/metool.png");
  assert.deepEqual(crop.region, t.enemyActors.metool.animations.defense.frames[0].region);
});

test("preview an enemy by its sheet when it differs from its kind", () => {
  const t = fakeTables();
  const crop = resolveSpriteCrop(
    {
      id: "enemy.crab",
      category: "enemy",
      components: { enemy: { kind: "crab", sheet: "metool" } },
    },
    t,
  );
  assert.ok(crop);
  assert.equal(crop.imageUrl, "memory://sprites/enemies/metool.png");
});

test("preview life pickup by its sheet, preferring idle", () => {
  const t = fakeTables();
  const crop = resolveSpriteCrop(
    {
      id: "pickup.life.small",
      category: "pickup",
      components: { pickup: { kind: "life", size: "small", sheet: "sheal" } },
    },
    t,
  );
  assert.ok(crop);
  assert.equal(crop.imageUrl, "memory://sprites/pickups/sheal.png");
  assert.deepEqual(crop.region, t.pickupActors.sheal.animations.idle.frames[0].region);
});

test("preview a life pickup through older small/large bindings by its size", () => {
  const t = fakeTables();
  const legacy = { ...t, pickupActors: { small: t.pickupActors.sheal } };
  const crop = resolveSpriteCrop(
    {
      id: "pickup.life.small",
      category: "pickup",
      components: { pickup: { kind: "life", size: "small", sheet: "sheal" } },
    },
    legacy,
  );
  assert.ok(crop);
  assert.equal(crop.imageUrl, "memory://sprites/pickups/sheal.png");
});

test("preview weapon capsule by its sheet", () => {
  const t = fakeTables();
  const crop = resolveSpriteCrop(
    {
      id: "pickup.weapon.large",
      category: "pickup",
      components: { pickup: { kind: "weapon", size: "large", sheet: "ammo" } },
    },
    t,
  );
  assert.ok(crop);
  assert.equal(crop.imageUrl, "memory://sprites/pickups/ammo.png");
  assert.deepEqual(crop.region, t.pickupActors.ammo.animations.idle.frames[0].region);
});

test("definition without sprite returns null", () => {
  assert.equal(
    resolveSpriteCrop({ id: "camera.bound", category: "camera", components: {} }, fakeTables()),
    null,
  );
});

test("unknown kind returns null without throwing", () => {
  assert.equal(
    resolveSpriteCrop(
      {
        id: "enemy.ghost",
        category: "enemy",
        components: { enemy: { kind: "ghost" } },
      },
      fakeTables(),
    ),
    null,
  );
  assert.equal(
    resolveSpriteCrop(
      {
        id: "pickup.mystery",
        category: "pickup",
        components: { pickup: { kind: "mystery", size: "small" } },
      },
      fakeTables(),
    ),
    null,
  );
});

test("falls back to first available animation", () => {
  const t = fakeTables();
  const onlyWalk = {
    ...t,
    enemyActors: {
      walker: {
        sheet: "image.enemy",
        animations: {
          walk: {
            loop: true,
            speed: 1,
            frames: [{ region: [9, 9, 8, 8] as const, duration: 1 }],
          },
        },
      },
    },
  };
  const crop = resolveSpriteCrop(
    {
      id: "enemy.walker",
      category: "enemy",
      components: { enemy: { kind: "walker" } },
    },
    onlyWalk,
  );
  assert.ok(crop);
  assert.deepEqual(crop.region, [9, 9, 8, 8]);
});

test("catalog load is idempotent and shares one loader call", async () => {
  let loads = 0;
  const catalog = createCatalog({
    tables: fakeTables(),
    sheetUrls: fakeTables().sheetUrls,
    validate: () => undefined,
    loadSheets: async () => {
      loads += 1;
      await new Promise((r) => setTimeout(r, 10));
    },
    resolveTexture: () => null,
    toAnimData: (actor) => actor as AnimData,
  });

  await Promise.all([catalog.load(), catalog.load(), catalog.load()]);
  await catalog.load();
  assert.equal(loads, 1);
  assert.equal(catalog.loaded, true);
});

test("oncePromise clears on failure so callers can retry", async () => {
  let attempts = 0;
  const load = oncePromise(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("boom");
  });
  await assert.rejects(() => load(), /boom/);
  await load();
  assert.equal(attempts, 2);
});

test("catalog getSpritePreview exposes texture from resolver without sheet names", () => {
  const fake = { id: "tex" } as unknown as import("pixi.js").Texture;
  const catalog = createCatalog({
    tables: fakeTables(),
    sheetUrls: fakeTables().sheetUrls,
    validate: () => undefined,
    loadSheets: async () => undefined,
    resolveTexture: (sheet, region) => {
      assert.equal(sheet, "image.enemy");
      assert.deepEqual(region, fakeTables().enemyActors.metool.animations.defense.frames[0].region);
      return fake;
    },
    toAnimData: (actor) => actor as AnimData,
  });

  const preview = catalog.getSpritePreview({
    id: "enemy.metool",
    category: "enemy",
    components: { enemy: { kind: "metool" } },
  });
  assert.ok(preview);
  assert.equal(preview.imageUrl, "memory://sprites/enemies/metool.png");
  assert.equal(preview.texture, fake);
  assert.equal("sheet" in preview, false);
});

test("attach leaves actors whose clips the scene owns alone", () => {
  const catalog = createCatalog({
    tables: fakeTables(),
    sheetUrls: fakeTables().sheetUrls,
    validate: () => undefined,
    loadSheets: async () => undefined,
    resolveTexture: () => null,
    toAnimData: (actor) => actor as AnimData,
  });
  const loaded: string[] = [];
  const actor = (name: string, sceneClips: boolean) => ({
    sceneClips,
    stats: { sheet: "metool" },
    loadAnimations: () => loaded.push(name),
  });

  catalog.attachPlayerAnimations(actor("owned player", true));
  catalog.attachEnemyAnimations(actor("owned enemy", true));
  catalog.attachPlayerAnimations(actor("player", false));
  catalog.attachEnemyAnimations(actor("enemy", false));
  assert.deepEqual(loaded, ["player", "enemy"]);
});

test("a life capsule loads its clips by sheet, else by its Kind (older bindings), else throws", () => {
  const t = fakeTables();
  const catalog = (pickupActors: PreviewTables["pickupActors"]) =>
    createCatalog({
      tables: { ...t, pickupActors },
      sheetUrls: t.sheetUrls,
      validate: () => undefined,
      loadSheets: async () => undefined,
      resolveTexture: () => null,
      toAnimData: (actor) => actor as AnimData,
    });
  const loaded: AnimData[] = [];
  const capsule = {
    sheet: "sheal",
    kind: "small",
    loadAnimations: (d: AnimData) => loaded.push(d),
  };

  catalog(t.pickupActors).attachLifeCapsuleAnimations(capsule);
  catalog({ small: t.pickupActors.sheal }).attachLifeCapsuleAnimations(capsule);
  assert.deepEqual(loaded, [t.pickupActors.sheal, t.pickupActors.sheal]);
  assert.throws(
    () => catalog({}).attachLifeCapsuleAnimations(capsule),
    /No pickup animations for pickup sheet 'sheal'/,
  );
});

test("AC-SHEET: an overlay's life.huge is drawn from its animation sheet in game, preview and palette", () => {
  const overlay = {
    pickups: {
      "life.huge": {
        id: "life.huge",
        behavior: "pickup.life",
        sheet: "anim.pickup.huge",
        amount: 16,
      },
    },
    prefabs: {
      "pickup.life.huge": {
        id: "pickup.life.huge",
        runtime: "pickup",
        source: { kind: "pickup", ref: "life.huge" },
        fields: [],
      },
    },
  } as GameDataOverlay;
  const withPack = mergeGameData(GAME_DATA, pack as GameDataOverlay);
  assert.ok(withPack.ok);
  const merged = mergeGameData(withPack.value, overlay);
  assert.ok(merged.ok);
  const compiled = compileGameData(merged.value, buildCompileRegistries());
  assert.ok(compiled.ok);

  const huge = {
    id: "anim.pickup.huge",
    kind: "animation",
    path: "sprites/pickups/huge_anims.json",
    sheetAssetId: "image.pickup.large",
    animations: {
      idle: { loop: true, speed: 1, frames: [{ region: [16, 0, 24, 24] as const, duration: 1 }] },
    },
  } as const;
  const manifest = buildRendererAssetManifestFromProject(
    {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      id: "test.huge",
      name: "Huge",
      gameVersion: "1.0.0",
      compatibleRuntime: { min: "1.0.0" },
      entryLevelId: "intro",
      levels: [{ id: "intro", path: "levels/intro.json" }],
      assets: [
        { id: "image.player", kind: "image", path: "sprites/player/x.png" },
        { id: "image.pickup.large", kind: "image", path: "sprites/pickups/heal.png" },
        {
          id: "anim.player",
          kind: "animation",
          path: "sprites/player/x_anims.json",
          sheetAssetId: "image.player",
          animations: {
            idle: {
              loop: true,
              speed: 1,
              frames: [{ region: [0, 0, 8, 8] as const, duration: 1 }],
            },
          },
        },
        huge,
      ],
    },
    {
      playerAnimation: "anim.player",
      playerSheetNormal: "image.player",
      enemyActors: {},
      // What studioBindingsToRendererBindings derives for a pickup whose sheet is an animation asset.
      pickupActors: { "anim.pickup.huge": "anim.pickup.huge" },
      shotAnimations: "anim.player",
      sheetImages: { "image.player": "image.player", "image.pickup.large": "image.pickup.large" },
      hudSheets: { xBar: "image.player", hpFill: "image.player", weaponBar: "image.player" },
    },
    (asset) => `memory://${asset.path}`,
    { shotAnims: { sheets: {}, animations: {} } },
  );

  // Palette and editor preview: the catalog definition carries the sheet the crop is found by.
  const def = definitionsFromGameData(merged.value).find((d) => d.id === "pickup.life.huge");
  assert.ok(def);
  assert.deepEqual(def.components.pickup, {
    kind: "life",
    size: "huge",
    sheet: "anim.pickup.huge",
  });
  const crop = resolveSpriteCrop(def, manifestToPreviewTables(manifest));
  assert.ok(crop);
  assert.equal(crop.imageUrl, "memory://sprites/pickups/heal.png");
  assert.deepEqual(crop.region, [16, 0, 24, 24]);

  // In game: the capsule names its sheet, the catalog loads its clips, the renderer keys by it.
  const capsule = new LifeCapsule(
    { id: "huge.1", kind: "huge", x: 0, y: 0, w: 16, h: 16 },
    compiled.value,
  );
  assert.equal(capsule.sheet, "anim.pickup.huge");
  assert.equal(capsule.heal, 16);
  createCatalog({
    tables: manifestToPreviewTables(manifest),
    sheetUrls: manifest.sheetUrls,
    validate: () => undefined,
    loadSheets: async () => undefined,
    resolveTexture: () => null,
    toAnimData: (actor) => actor as AnimData,
  }).attachLifeCapsuleAnimations(capsule);
  assert.deepEqual(capsule.currentRegion(), [16, 0, 24, 24]);
  assert.equal(manifest.pickupActors[capsule.sheet]?.sheet, "image.pickup.large");
});
