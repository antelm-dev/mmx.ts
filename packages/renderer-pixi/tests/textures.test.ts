import assert from "node:assert/strict";
import { test } from "node:test";
import { Texture } from "pixi.js";
import { loadSheets, resetTextureCacheForTests } from "../src/render/textures.js";

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
