import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectBoundAssetIds,
  resolveBoundAssetId,
  type SoundBindingMap,
} from "../src/soundBindings.js";

const bindings: SoundBindingMap = {
  jump: "sfx.player.jump",
  land: "sfx.player.land",
  customBoom: "sfx.custom.boom",
};

test("resolveBoundAssetId maps runtime names through bindings", () => {
  assert.equal(resolveBoundAssetId("jump", bindings), "sfx.player.jump");
  assert.equal(resolveBoundAssetId("sfx.player.jump", bindings), "sfx.player.jump");
  assert.equal(resolveBoundAssetId("jump", null), "jump");
});

test("collectBoundAssetIds returns unique sorted logical ids only", () => {
  assert.deepEqual(collectBoundAssetIds(bindings), [
    "sfx.custom.boom",
    "sfx.player.jump",
    "sfx.player.land",
  ]);
});
