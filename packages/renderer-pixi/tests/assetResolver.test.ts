import assert from "node:assert/strict";
import { test } from "node:test";
import type { AnimData } from "@mmx/contracts/animation";
import { PROJECT_SCHEMA_VERSION, type ProjectDocument } from "@mmx/project-schema";
import {
  adaptLegacyFilenameSheetImages,
  adaptLegacyFilenameShotSheets,
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
        sheetAssetId: "image.player",
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
    "image.player": "image.player",
    "image.player.arm": "image.player.arm",
    "image.enemy": "image.enemy",
    "image.pickup": "image.pickup",
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

test("sheetKey uses logical asset ids not path basenames", () => {
  const resolver = createRendererAssetResolver({
    assets: fakeProject().assets,
    resolveUrl: (asset) => `memory://${asset.path}`,
  });

  assert.equal(resolver.sheetKey("image.player"), "image.player");
  assert.equal(resolver.sheetKey("image.enemy"), "image.enemy");
  assert.notEqual(resolver.sheetKey("image.player"), "x.png");
});

test("buildRendererAssetManifest resolves logical ids into preview tables", () => {
  const resolver = createRendererAssetResolver({
    assets: fakeProject().assets,
    resolveUrl: (asset) => `memory://${asset.path}`,
  });

  const manifest = buildRendererAssetManifest(resolver, bindings, {
    shotAnims: {
      sheets: { lemon: "image.player" },
      animations: {
        lemon: {
          loop: true,
          speed: 1,
          frames: [{ region: [0, 0, 16, 16], duration: 1 }],
        },
      },
    },
  });

  assert.equal(manifest.sheetUrls["image.player"], "memory://sprites/player/x.png");
  assert.equal(manifest.playerSheet, "image.player");
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
        sheets: { dash: "image.player" },
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

  assert.equal(manifest.pickupActors.small.sheet, "image.pickup");
  assert.equal(manifest.enemyActors.metool.sheet, "image.enemy");
});

test("shared basenames in different directories keep distinct sheet identities", () => {
  const project = fakeProject({
    assets: [
      { id: "image.players.common", kind: "image", path: "players/common.png" },
      { id: "image.enemies.common", kind: "image", path: "enemies/common.png" },
      { id: "image.pickups.common", kind: "image", path: "pickups/common.png" },
      {
        id: "anim.player",
        kind: "animation",
        path: "players/common_anims.json",
        sheetAssetId: "image.players.common",
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
        path: "enemies/common_anims.json",
        sheetAssetId: "image.enemies.common",
        animations: {
          defense: {
            loop: true,
            speed: 1,
            frames: [{ region: [0, 0, 16, 16] as const, duration: 0.1 }],
          },
        },
      },
      {
        id: "anim.pickup.small",
        kind: "animation",
        path: "pickups/common_anims.json",
        sheetAssetId: "image.pickups.common",
        animations: {
          idle: {
            loop: true,
            speed: 1,
            frames: [{ region: [0, 0, 8, 8] as const, duration: 0.1 }],
          },
        },
      },
      {
        id: "anim.shots",
        kind: "animation",
        path: "effects/shots.json",
        sheetAssetId: "image.players.common",
        animations: {
          lemon: {
            loop: true,
            speed: 1,
            frames: [{ region: [0, 0, 16, 16] as const, duration: 1 }],
          },
        },
      },
    ],
  });

  const resolver = createRendererAssetResolver({
    assets: project.assets,
    resolveUrl: (asset) => `memory://${asset.path}`,
  });

  assert.equal(resolver.sheetKey("image.players.common"), "image.players.common");
  assert.equal(resolver.sheetKey("image.enemies.common"), "image.enemies.common");
  assert.equal(resolver.sheetKey("image.pickups.common"), "image.pickups.common");

  const manifest = buildRendererAssetManifest(
    resolver,
    {
      playerAnimation: "anim.player",
      playerSheetNormal: "image.players.common",
      playerSheetPointing: "image.players.common",
      enemyActors: { metool: "anim.enemy.metool" },
      pickupActors: { small: "anim.pickup.small" },
      shotAnimations: "anim.shots",
      sheetImages: {
        "image.players.common": "image.players.common",
        "image.enemies.common": "image.enemies.common",
        "image.pickups.common": "image.pickups.common",
      },
    },
    {
      shotAnims: {
        sheets: { lemon: "image.players.common" },
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

  assert.equal(manifest.sheetUrls["image.players.common"], "memory://players/common.png");
  assert.equal(manifest.sheetUrls["image.enemies.common"], "memory://enemies/common.png");
  assert.equal(manifest.sheetUrls["image.pickups.common"], "memory://pickups/common.png");
  assert.equal(manifest.playerSheet, "image.players.common");
  assert.equal(manifest.enemyActors.metool.sheet, "image.enemies.common");
  assert.equal(manifest.pickupActors.small.sheet, "image.pickups.common");
  assert.equal(manifest.shotAnims.sheets.lemon, "image.players.common");

  const tables = manifestToPreviewTables(manifest);
  const enemyCrop = resolveSpriteCrop(
    { id: "enemy.metool", category: "enemy", components: { enemy: { kind: "metool" } } },
    tables,
  );
  const pickupCrop = resolveSpriteCrop(
    {
      id: "pickup.life.small",
      category: "pickup",
      components: { pickup: { kind: "life", size: "small" } },
    },
    tables,
  );
  assert.ok(enemyCrop);
  assert.ok(pickupCrop);
  assert.equal(enemyCrop.imageUrl, "memory://enemies/common.png");
  assert.equal(pickupCrop.imageUrl, "memory://pickups/common.png");
  assert.notEqual(enemyCrop.imageUrl, pickupCrop.imageUrl);
});

test("filename-keyed sheetImages without adapter fail closed on logical lookup", () => {
  const resolver = createRendererAssetResolver({
    assets: fakeProject().assets,
    resolveUrl: (asset) => `memory://${asset.path}`,
  });

  assert.throws(
    () =>
      buildRendererAssetManifest(resolver, {
        ...bindings,
        sheetImages: {
          "x.png": "image.player",
          "x_leftarm.png": "image.player.arm",
          "metool.png": "image.enemy",
          "sheal.png": "image.pickup",
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof RendererAssetError);
      assert.equal(error.code, "asset.invalid");
      assert.match(error.message, /image\.player/);
      assert.match(error.message, /not listed in sheetImages/);
      return true;
    },
  );
});

test("adaptLegacyFilenameSheetImages remaps unique basenames and rejects collisions", () => {
  const uniqueResolver = createRendererAssetResolver({
    assets: fakeProject().assets,
    resolveUrl: (asset) => `memory://${asset.path}`,
  });

  assert.deepEqual(
    adaptLegacyFilenameSheetImages(uniqueResolver, {
      "x.png": "image.player",
      "metool.png": "image.enemy",
    }),
    {
      "image.player": "image.player",
      "image.enemy": "image.enemy",
    },
  );

  const colliding = createRendererAssetResolver({
    assets: [
      { id: "image.players.common", kind: "image", path: "players/common.png" },
      { id: "image.enemies.common", kind: "image", path: "enemies/common.png" },
    ],
    resolveUrl: (asset) => `memory://${asset.path}`,
  });

  assert.throws(
    () =>
      adaptLegacyFilenameSheetImages(colliding, {
        "common.png": "image.players.common",
      }),
    (error: unknown) => {
      assert.ok(error instanceof RendererAssetError);
      assert.equal(error.code, "asset.ambiguous_sheet_key");
      assert.match(error.message, /image\.players\.common/);
      assert.match(error.message, /image\.enemies\.common/);
      return true;
    },
  );
});

test("adaptLegacyFilenameShotSheets remaps basename shot refs onto asset ids", () => {
  const resolver = createRendererAssetResolver({
    assets: fakeProject().assets,
    resolveUrl: (asset) => `memory://${asset.path}`,
  });
  const logical = adaptLegacyFilenameSheetImages(resolver, {
    "x.png": "image.player",
    "metool.png": "image.enemy",
  });
  const adapted = adaptLegacyFilenameShotSheets(resolver, logical, {
    sheets: { lemon: "x.png", burst: "image.enemy" },
    animations: {
      lemon: {
        loop: true,
        speed: 1,
        frames: [{ region: [0, 0, 16, 16], duration: 1 }],
      },
      burst: {
        loop: false,
        speed: 1,
        frames: [{ region: [0, 0, 8, 8], duration: 1 }],
      },
    },
  });
  assert.equal(adapted.sheets.lemon, "image.player");
  assert.equal(adapted.sheets.burst, "image.enemy");
});

test("createAssetCatalog uses injected manifest without core-owned assets", async () => {
  const manifest = buildRendererAssetManifestFromProject(
    fakeProject(),
    bindings,
    (asset) => `memory://${asset.path}`,
    {
      shotAnims: {
        sheets: { lemon: "image.player" },
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
