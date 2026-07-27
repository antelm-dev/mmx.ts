import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnimData } from "@mmx/contracts/animation";
import { PROJECT_SCHEMA_VERSION, type ProjectDocument } from "@mmx/project-schema";
import {
  buildRendererAssetManifest,
  buildRendererAssetManifestFromProject,
  createRendererAssetResolver,
  manifestToPreviewTables,
  RendererAssetError,
} from "../src/assets/index.js";
import { createAssetCatalog } from "../src/editor/catalog.js";
import { resolveSpriteCrop } from "../src/editor/preview.js";

const IDLE_REGION = [0, 0, 32, 32] as const;

function fakeProject(overrides: Partial<ProjectDocument> = {}): ProjectDocument {
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "test.project",
    name: "Test",
    gameVersion: "1.0.0",
    compatibleRuntime: { min: "1.0.0" },
    entryLevelId: "intro",
    levels: [{ id: "intro", path: "levels/intro.json" }],
    assets: [
      { id: "image.player", kind: "image", path: "sprites/player/x.png" },
      { id: "image.player.arm", kind: "image", path: "sprites/player/x_leftarm.png" },
      { id: "image.enemy", kind: "image", path: "sprites/enemies/metool.png" },
      { id: "image.pickup", kind: "image", path: "sprites/pickups/sheal.png" },
      {
        id: "anim.player",
        kind: "animation",
        path: "sprites/player/x_anims.json",
        sheetAssetId: "image.player",
        animations: {
          idle: {
            loop: true,
            speed: 1,
            frames: [{ region: IDLE_REGION, duration: 0.1 }],
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
            frames: [{ region: [8, 8, 16, 16] as const, duration: 0.1 }],
          },
        },
      },
      {
        id: "anim.pickup.small",
        kind: "animation",
        path: "sprites/pickups/small_anims.json",
        sheetAssetId: "image.pickup",
        animations: {
          idle: {
            loop: true,
            speed: 1,
            frames: [{ region: [0, 0, 16, 16] as const, duration: 0.1 }],
          },
        },
      },
      {
        id: "anim.shots",
        kind: "animation",
        path: "sprites/effects/shot_anims.json",
        animations: {
          lemon: {
            loop: true,
            speed: 1,
            frames: [{ region: [0, 0, 16, 16] as const, duration: 1 }],
          },
        },
      },
    ],
    ...overrides,
  };
}

const bindings = {
  playerAnimation: "anim.player",
  playerSheetNormal: "image.player",
  playerSheetPointing: "image.player.arm",
  enemyActors: { metool: "anim.enemy.metool" },
  pickupActors: { small: "anim.pickup.small" },
  shotAnimations: "anim.shots",
  sheetImages: {
    "x.png": "image.player",
    "x_leftarm.png": "image.player.arm",
    "metool.png": "image.enemy",
    "sheal.png": "image.pickup",
    "lemon.png": "image.player",
  },
} as const;

test("createRendererAssetResolver throws deterministic missing asset errors", () => {
  const resolver = createRendererAssetResolver({
    assets: fakeProject().assets,
    resolveUrl: (asset) => `memory://${asset.path}`,
  });

  assert.throws(
    () => resolver.require("missing.hero"),
    (error: unknown) => {
      assert.ok(error instanceof RendererAssetError);
      assert.equal(error.assetId, "missing.hero");
      assert.equal(error.code, "asset.missing");
      assert.match(error.message, /missing\.hero/);
      return true;
    },
  );
});

test("createRendererAssetResolver throws deterministic invalid kind errors", () => {
  const resolver = createRendererAssetResolver({
    assets: fakeProject().assets,
    resolveUrl: (asset) => `memory://${asset.path}`,
  });

  assert.throws(
    () => resolver.requireKind("image.player", ["animation"]),
    (error: unknown) => {
      assert.ok(error instanceof RendererAssetError);
      assert.equal(error.assetId, "image.player");
      assert.equal(error.code, "asset.invalid_kind");
      assert.match(error.message, /image\.player/);
      return true;
    },
  );
});

test("buildRendererAssetManifest resolves logical ids into preview tables", () => {
  const resolver = createRendererAssetResolver({
    assets: fakeProject().assets,
    resolveUrl: (asset) => `memory://${asset.path}`,
  });

  const manifest = buildRendererAssetManifest(resolver, bindings, {
    shotAnims: {
      sheets: { lemon: "lemon.png" },
      animations: {
        lemon: {
          loop: true,
          speed: 1,
          frames: [{ region: [0, 0, 16, 16], duration: 1 }],
        },
      },
    },
  });

  assert.equal(manifest.sheetUrls["x.png"], "memory://sprites/player/x.png");
  assert.equal(manifest.playerSheet, "x.png");
  assert.deepEqual(manifest.playerAnims.animations.idle.frames[0].region, IDLE_REGION);
  assert.equal(manifest.enemyActorIds.metool, "anim.enemy.metool");

  const tables = manifestToPreviewTables(manifest);
  const crop = resolveSpriteCrop(
    { id: "enemy.metool", category: "enemy", components: { enemy: { kind: "metool" } } },
    tables,
  );
  assert.ok(crop);
  assert.equal(crop.imageUrl, "memory://sprites/enemies/metool.png");
});

test("buildRendererAssetManifestFromProject wires project assets end-to-end", () => {
  const manifest = buildRendererAssetManifestFromProject(
    fakeProject(),
    bindings,
    (asset) => `blob://${asset.id}`,
    {
      shotAnims: {
        sheets: { dash: "x.png" },
        animations: {
          dash: {
            loop: false,
            speed: 1,
            frames: [{ region: IDLE_REGION, duration: 1 }],
          },
        },
      },
    },
  );

  assert.equal(manifest.pickupActors.small.sheet, "sheal.png");
  assert.equal(manifest.enemyActors.metool.sheet, "metool.png");
});

test("createAssetCatalog uses injected manifest without reading resources/", async () => {
  const manifest = buildRendererAssetManifestFromProject(
    fakeProject(),
    bindings,
    (asset) => `memory://${asset.path}`,
    {
      shotAnims: {
        sheets: { lemon: "lemon.png" },
        animations: {
          lemon: {
            loop: true,
            speed: 1,
            frames: [{ region: [0, 0, 16, 16], duration: 1 }],
          },
        },
      },
    },
  );

  let validated = false;
  const catalog = createAssetCatalog({
    manifest,
    validate: () => {
      validated = true;
    },
    loadSheets: async () => undefined,
    resolveTexture: () => null,
  });

  await catalog.load();
  assert.equal(validated, true);

  const preview = catalog.getSpritePreview({
    id: "spawn",
    category: "spawn",
    components: { player: {} },
  });
  assert.ok(preview);
  assert.equal(preview.imageUrl, "memory://sprites/player/x.png");
});

test("catalog attachEnemyAnimations reports logical asset id on missing actor", () => {
  const manifest = buildRendererAssetManifestFromProject(
    fakeProject(),
    bindings,
    (asset) => `memory://${asset.path}`,
    { shotAnims: { sheets: {}, animations: {} } },
  );
  const broken = {
    ...manifest,
    enemyActors: {},
  };

  const catalog = createAssetCatalog({ manifest: broken });
  const enemy = {
    stats: { sheet: "metool" },
    loadAnimations(_data: AnimData) {},
  };

  assert.throws(() => catalog.attachEnemyAnimations(enemy), /Renderer asset 'anim\.enemy\.metool'/);
});
