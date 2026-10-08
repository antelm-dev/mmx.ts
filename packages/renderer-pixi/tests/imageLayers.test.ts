import assert from "node:assert/strict";
import { test } from "node:test";
import { Rectangle, Texture } from "pixi.js";
import type { DecorationInstance, ImageLayer } from "@mmx/content-schema";
import { VIEW_HEIGHT, VIEW_WIDTH } from "@mmx/engine";
import { DecorationView } from "../src/render/DecorationView.js";
import { loadSheets, resetTextureCacheForTests } from "../src/render/textures.js";

const stage: ImageLayer = {
  id: "img.stage",
  assetId: "image.stage",
  x: 0.4, // authored off-grid on purpose: must land on a whole pixel
  y: -32,
  parallax: 1,
  layer: "world-back",
};
const background: ImageLayer = {
  id: "img.bg",
  assetId: "image.bg",
  x: 0,
  y: 0,
  parallax: 0.5,
  layer: "background",
};
const blastMark: DecorationInstance = {
  id: "d1",
  assetId: "fx.explosion",
  x: 40,
  y: 40,
  layer: "background",
};

test("image layers: layer order, whole-pixel parallax and backdrop", async (t) => {
  resetTextureCacheForTests();
  const { Assets } = await import("pixi.js");
  const original = Assets.load;
  t.after(() => {
    Assets.load = original;
    resetTextureCacheForTests();
  });
  const sheet = new Texture({ source: Texture.WHITE.source, frame: new Rectangle(0, 0, 1, 1) });
  Assets.load = (async () => sheet) as typeof Assets.load;
  await loadSheets({
    "image.stage": "/assets/stage.png",
    "image.bg": "/assets/bg.png",
    "explosion.png": "/assets/explosion.png",
  });

  const view = new DecorationView();
  view.setDecorations([blastMark], { imageLayers: [stage, background], backdrop: "#3a1c5c" });

  // Each image goes into its own layer's container, behind the catalog decorations there.
  assert.equal(view.worldBack.children.length, 1);
  assert.equal(view.background.children.length, 2);
  const stageSprite = view.worldBack.children[0]!;
  const bgSprite = view.background.children[0]!;
  assert.equal(bgSprite.position.x, 0);
  assert.equal(view.background.children[1]!.position.x, blastMark.x);

  // Backdrop: a full-view rect in the level colour.
  assert.equal(view.backdrop.visible, true);
  assert.equal(view.backdrop.tint, 0x3a1c5c);
  assert.equal(view.backdrop.width, VIEW_WIDTH);
  assert.equal(view.backdrop.height, VIEW_HEIGHT);

  // Scene offset is -camera; screen x = container x + sprite x (world-back rides the scene).
  for (const camX of [0, 301]) {
    const ox = 0 - camX;
    view.syncCamera(ox, 0);
    assert.equal(ox + stageSprite.position.x, 0 - camX, `stage at camX=${camX}`);
    assert.equal(stageSprite.position.y, -32);
    // MMX1 background scroll: camX / 2 in whole pixels.
    const bgScreenX = view.background.position.x + bgSprite.position.x;
    assert.equal(bgScreenX, 0 - Math.floor(camX / 2), `background at camX=${camX}`);
    assert.ok(Number.isInteger(bgScreenX));
  }

  // Same art again is a no-op; dropping the backdrop hides it.
  view.setDecorations([blastMark], { imageLayers: [stage, background] });
  assert.equal(view.worldBack.children[0], stageSprite);
  assert.equal(view.backdrop.visible, false);
  view.destroy();
});
