import assert from "node:assert/strict";
import { test } from "node:test";
import { Scene, Tile } from "@mmx/engine";
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

test("a OneWay tile builds as a top edge only, without a ramp profile", () => {
  const level = testLevel();
  level.tiles[10 * level.cols + 4] = Tile.OneWay;
  const terrain = new TerrainView(Scene.create({ level, seed: 1 }).stage);
  // Its stroke at y + 0.5 is now the highest geometry: the bounds start at its top edge.
  assert.equal(terrain.tiles.getLocalBounds().y, 10 * 16);
  terrain.view.destroy({ children: true });
});
