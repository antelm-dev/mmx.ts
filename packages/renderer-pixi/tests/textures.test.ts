import assert from "node:assert/strict";
import { test } from "node:test";
import { Texture } from "pixi.js";
import {
  loadSheets,
  resetSheetCache,
  resetTextureCacheForTests,
  sheetTexture,
} from "../src/render/textures.js";

test("loadSheets refuses to overwrite an existing sheet with a different URL", async (t) => {
  resetTextureCacheForTests();
  const { Assets } = await import("pixi.js");
  const original = Assets.load;
  t.after(() => {
    Assets.load = original;
    resetTextureCacheForTests();
  });

  Assets.load = (async () => Texture.EMPTY) as typeof Assets.load;
  await loadSheets({ "image.players.common": "https://example.test/players/common.png" });
  await assert.rejects(
    () => loadSheets({ "image.players.common": "https://example.test/enemies/common.png" }),
    /refusing to overwrite/,
  );
});

test("resetSheetCache lets a key reload from a new URL and unloads the old one", async (t) => {
  resetTextureCacheForTests();
  const { Assets } = await import("pixi.js");
  const originalLoad = Assets.load;
  const originalUnload = Assets.unload;
  t.after(() => {
    Assets.load = originalLoad;
    Assets.unload = originalUnload;
    resetTextureCacheForTests();
  });

  const byUrl = new Map([
    ["https://example.test/1.png", new Texture()],
    ["https://example.test/2.png", new Texture()],
  ]);
  let loads = 0;
  const unloaded: unknown[] = [];
  Assets.load = (async (url: string) => {
    loads += 1;
    return byUrl.get(url);
  }) as typeof Assets.load;
  Assets.unload = (async (urls: unknown) => {
    unloaded.push(urls);
  }) as typeof Assets.unload;

  await loadSheets({ a: "https://example.test/1.png" });
  await loadSheets({ a: "https://example.test/1.png" });
  assert.equal(loads, 1, "same-URL reload stays cached");
  assert.equal(sheetTexture("a"), byUrl.get("https://example.test/1.png"));

  await resetSheetCache();
  assert.deepEqual(unloaded, [["https://example.test/1.png"]]);
  assert.equal(sheetTexture("a"), null);

  await loadSheets({ a: "https://example.test/2.png" });
  assert.equal(sheetTexture("a"), byUrl.get("https://example.test/2.png"));
});
