import assert from "node:assert/strict";
import { test } from "node:test";
import { Scene } from "@mmx/engine";
import { TerrainView } from "../src/render/terrain.js";
import { testLevel } from "./testLevel.js";

test("terrain tiles hide under a world image layer and show without art", () => {
  const terrain = new TerrainView(Scene.create({ level: testLevel(), seed: 1 }).stage);
  assert.equal(terrain.tiles.visible, true);

  const layer = { id: "img", assetId: "image.stage", x: 0, y: 0, parallax: 1 };
  terrain.setArt({ imageLayers: [{ ...layer, layer: "background" }] });
  assert.equal(terrain.tiles.visible, true, "a parallax layer does not paint the terrain");
  terrain.setArt({ imageLayers: [{ ...layer, layer: "world-back" }] });
  assert.equal(terrain.tiles.visible, false);
  terrain.setArt(undefined);
  assert.equal(terrain.tiles.visible, true);
  terrain.setArt({ imageLayers: [{ ...layer, layer: "world-front" }] });
  assert.equal(terrain.tiles.visible, false);
  terrain.view.destroy({ children: true });
});
