import { test } from "node:test";
import assert from "node:assert/strict";

import { TerrainTile } from "../src/index.js";

test("TerrainTile numeric values match the level format", () => {
  assert.equal(TerrainTile.Empty, 0);
  assert.equal(TerrainTile.Solid, 1);
  assert.equal(TerrainTile.SlopeUpRight, 2);
  assert.equal(TerrainTile.SlopeUpLeft, 3);
});
