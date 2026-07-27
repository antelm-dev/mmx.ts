import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import type { AnimData } from "@mmx/contracts/animation";
import { createCatalog } from "../src/editor/catalogCore.js";
import { oncePromise } from "../src/editor/once.js";
import { resolveSpriteCrop, type PreviewTables } from "../src/editor/preview.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function loadJson(rel: string): unknown {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function tables(): PreviewTables {
  const playerAnims = loadJson("resources/sprites/player/x_anims.json") as AnimData;
  const enemies = loadJson("resources/sprites/enemies/enemy_anims.json") as {
    actors: PreviewTables["enemyActors"];
  };
  const pickups = loadJson("resources/sprites/pickups/pickup_anims.json") as {
    actors: PreviewTables["pickupActors"];
  };
  const sheetUrls: Record<string, string> = {
    "x.png": "player://x.png",
    "metool.png": "enemy://metool.png",
    "sbat.png": "enemy://sbat.png",
    "sheal.png": "pickup://sheal.png",
    "heal.png": "pickup://heal.png",
    "sammo.png": "pickup://sammo.png",
    "ammo.png": "pickup://ammo.png",
  };
  return {
    sheetUrls,
    playerAnims,
    playerSheet: "x.png",
    enemyActors: enemies.actors,
    pickupActors: pickups.actors,
  };
}

test("preview spawn uses idle first frame", () => {
  const crop = resolveSpriteCrop(
    { id: "spawn", category: "spawn", components: { player: {} } },
    tables(),
  );
  assert.ok(crop);
  assert.equal(crop.imageUrl, "player://x.png");
  assert.deepEqual(crop.region, tables().playerAnims.animations.idle.frames[0].region);
});

test("preview Metool prefers defense", () => {
  const t = tables();
  const crop = resolveSpriteCrop(
    {
      id: "enemy.metool",
      category: "enemy",
      components: { enemy: { kind: "metool" } },
    },
    t,
  );
  assert.ok(crop);
  assert.equal(crop.imageUrl, "enemy://metool.png");
  assert.deepEqual(crop.region, t.enemyActors.metool.animations.defense.frames[0].region);
});

test("preview life pickup prefers idle", () => {
  const t = tables();
  const crop = resolveSpriteCrop(
    {
      id: "pickup.life.small",
      category: "pickup",
      components: { pickup: { kind: "life", size: "small" } },
    },
    t,
  );
  assert.ok(crop);
  assert.equal(crop.imageUrl, "pickup://sheal.png");
  assert.deepEqual(crop.region, t.pickupActors.small.animations.idle.frames[0].region);
});

test("preview weapon capsule maps size to ammo sheets", () => {
  const t = tables();
  const crop = resolveSpriteCrop(
    {
      id: "pickup.weapon.large",
      category: "pickup",
      components: { pickup: { kind: "weapon", size: "large" } },
    },
    t,
  );
  assert.ok(crop);
  assert.equal(crop.imageUrl, "pickup://ammo.png");
  assert.deepEqual(crop.region, t.pickupActors.ammo.animations.idle.frames[0].region);
});

test("definition without sprite returns null", () => {
  assert.equal(
    resolveSpriteCrop({ id: "camera.bound", category: "camera", components: {} }, tables()),
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
      tables(),
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
      tables(),
    ),
    null,
  );
});

test("falls back to first available animation", () => {
  const t = tables();
  const onlyWalk = {
    ...t,
    enemyActors: {
      walker: {
        sheet: "metool.png",
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
    tables: tables(),
    sheetUrls: tables().sheetUrls,
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
    tables: tables(),
    sheetUrls: tables().sheetUrls,
    validate: () => undefined,
    loadSheets: async () => undefined,
    resolveTexture: (sheet, region) => {
      assert.equal(sheet, "metool.png");
      assert.deepEqual(region, tables().enemyActors.metool.animations.defense.frames[0].region);
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
  assert.equal(preview.imageUrl, "enemy://metool.png");
  assert.equal(preview.texture, fake);
  assert.equal("sheet" in preview, false);
});
