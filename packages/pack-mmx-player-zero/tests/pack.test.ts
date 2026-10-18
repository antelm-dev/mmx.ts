import { test } from "node:test";
import assert from "node:assert/strict";

import manifest from "../pack.json" with { type: "json" };
import game from "../data/game.json" with { type: "json" };

// Content equivalence with the built-ins is proved by @mmx/engine's pack-mmx-players test.
test("the pack folder holds its manifest and Zero's game data", () => {
  assert.deepEqual(manifest, { id: "mmx-player-zero", name: "MMX — Zero", version: 1 });
  assert.equal(game.schemaVersion, 1);
  assert.deepEqual(Object.keys(game), ["schemaVersion", "actors", "abilities", "loadouts"]);
  assert.deepEqual(Object.keys(game.actors), ["player.zero"]);
  assert.deepEqual(Object.keys(game.abilities), [
    "zero.idle",
    "zero.walk",
    "zero.fall",
    "zero.wall-slide",
    "zero.dash",
    "zero.jump",
    "zero.dash-jump",
    "zero.wall-jump",
    "zero.dash-wall-jump",
    "zero.damage",
    "zero.death",
    "zero.slash",
  ]);
  assert.deepEqual(Object.keys(game.loadouts), ["player.zero"]);
});
