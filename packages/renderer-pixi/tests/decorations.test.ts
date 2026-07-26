import { test } from "node:test";
import assert from "node:assert/strict";

import type { DecorationInstance } from "@mmx/content-schema";
import {
  DECORATION_ASSETS,
  DEFAULT_LAYER_PARALLAX,
  decorationBounds,
  effectiveDecorationParallax,
  getDecorationAsset,
  knownDecorationAssetIds,
} from "../src/render/decorations.js";

test("decoration catalog uses stable ids and known sheets", () => {
  assert.ok(DECORATION_ASSETS.length > 0);
  const ids = new Set<string>();
  for (const asset of DECORATION_ASSETS) {
    assert.ok(!ids.has(asset.id), `duplicate asset id ${asset.id}`);
    ids.add(asset.id);
    assert.ok(asset.sheet.endsWith(".png"));
    assert.equal(asset.region.length, 4);
    assert.ok(asset.defaultLayer in DEFAULT_LAYER_PARALLAX);
    assert.ok(getDecorationAsset(asset.id));
  }
  assert.equal(knownDecorationAssetIds().size, DECORATION_ASSETS.length);
});

test("default and overridden parallax resolve correctly", () => {
  const base: DecorationInstance = {
    id: "d1",
    assetId: "prop.life-capsule",
    x: 0,
    y: 0,
    layer: "far-background",
  };
  assert.equal(effectiveDecorationParallax(base), DEFAULT_LAYER_PARALLAX["far-background"]);
  assert.equal(effectiveDecorationParallax({ ...base, parallax: 0.42 }), 0.42);

  const withAssetDefault: DecorationInstance = {
    ...base,
    assetId: "bg.cloud",
    layer: "far-background",
  };
  assert.equal(effectiveDecorationParallax(withAssetDefault), 0.15);
});

test("decorationBounds uses region and anchor", () => {
  const asset = getDecorationAsset("prop.life-capsule")!;
  const inst: DecorationInstance = {
    id: "d1",
    assetId: asset.id,
    x: 100,
    y: 50,
    layer: "world-front",
  };
  const box = decorationBounds(inst);
  assert.ok(box);
  assert.equal(box.w, asset.region[2]);
  assert.equal(box.h, asset.region[3]);
  assert.equal(box.x, 100 - asset.anchor[0] * box.w);
  assert.equal(box.y, 50 - asset.anchor[1] * box.h);
});

test("layer parallax defaults match the play-mode contract", () => {
  assert.equal(DEFAULT_LAYER_PARALLAX["far-background"], 0.15);
  assert.equal(DEFAULT_LAYER_PARALLAX.background, 0.5);
  assert.equal(DEFAULT_LAYER_PARALLAX["world-back"], 1);
  assert.equal(DEFAULT_LAYER_PARALLAX["world-front"], 1);
  assert.equal(DEFAULT_LAYER_PARALLAX.foreground, 1.15);
});
