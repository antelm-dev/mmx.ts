import assert from "node:assert/strict";
import { test } from "node:test";
import { Sprite, Texture, TextureSource } from "pixi.js";
import type { DecorationInstance, ImageLayer, LevelArt, TileLayer } from "@mmx/content-schema";
import { DecorationView } from "../src/render/DecorationView.js";
import { loadSheets, resetTextureCacheForTests } from "../src/render/textures.js";

// Synthetic 4×2 tileset of 16 px tiles on a 3×2-cell level.
const ground: TileLayer = {
  id: "tiles.ground",
  tilesetId: "tiles.stage",
  layer: "background",
  parallax: 0.5,
  cells: [0, -1, 5, -1, 7, 2],
};
const stage: ImageLayer = {
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
const art: LevelArt = {
  imageLayers: [stage],
  tileLayers: [ground],
  cols: 3,
  tilesets: { "tiles.stage": { tileSize: 16 } },
};

test("tile layers: one sprite per filled cell, layer order, grid placement and parallax", async (t) => {
  resetTextureCacheForTests();
  const { Assets } = await import("pixi.js");
  const original = Assets.load;
  t.after(() => {
    Assets.load = original;
    resetTextureCacheForTests();
  });
  const sheet = new Texture({ source: new TextureSource({ width: 64, height: 32 }) });
  Assets.load = (async () => sheet) as typeof Assets.load;
  await loadSheets({
    "tiles.stage": "/assets/tiles.png",
    "image.bg": "/assets/bg.png",
    "explosion.png": "/assets/explosion.png",
  });

  const view = new DecorationView();
  view.setDecorations([blastMark], art);

  // Image layer, then the tile layer's container, then catalog decorations.
  assert.equal(view.background.children.length, 3);
  const tiles = view.background.children[1]!;
  assert.equal(view.background.children[2]!.position.x, blastMark.x);
  assert.equal(tiles.children.length, 4);

  const placed = tiles.children.map((child) => {
    const frame = (child as Sprite).texture.frame;
    return [child.position.x, child.position.y, frame.x, frame.y, frame.width];
  });
  assert.deepEqual(placed, [
    [0, 0, 0, 0, 16], // cell 0 → tile 0
    [32, 0, 16, 16, 16], // cell 2 → tile 5 (col 1, row 1 of 4 columns)
    [16, 16, 48, 16, 16], // cell 4 → tile 7
    [32, 16, 32, 0, 16], // cell 5 → tile 2
  ]);

  // Background parallax like the image layer: whole pixels, half the camera.
  for (const camX of [0, 301]) {
    view.syncCamera(0 - camX, 0);
    const screenX = view.background.position.x + tiles.position.x;
    assert.equal(screenX, 0 - Math.floor(camX / 2), `tiles at camX=${camX}`);
    assert.equal(screenX, view.background.position.x + view.background.children[0]!.position.x);
    assert.ok(Number.isInteger(screenX));
  }

  // A layer parallax that differs from the layer default moves the whole tile container.
  view.setDecorations([], { ...art, imageLayers: [], tileLayers: [{ ...ground, parallax: 1 }] });
  const moved = view.background.children[0]!;
  view.syncCamera(-100, 0);
  assert.equal(view.background.position.x + moved.position.x, -100);

  // Same art again is a no-op; without the tileset geometry nothing is drawn.
  view.setDecorations([], { ...art, imageLayers: [], tileLayers: [{ ...ground, parallax: 1 }] });
  assert.equal(view.background.children[0], moved);
  view.setDecorations([], { ...art, tilesets: {} });
  assert.equal(view.background.children.length, 1);
  view.destroy();
});
