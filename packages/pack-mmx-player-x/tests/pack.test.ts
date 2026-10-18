import { test } from "node:test";
import assert from "node:assert/strict";

import manifest from "../pack.json" with { type: "json" };
import game from "../data/game.json" with { type: "json" };

// Content equivalence with the built-ins is proved by @mmx/engine's pack-mmx-players test.
test("the pack folder holds its manifest and X's game data", () => {
  assert.deepEqual(manifest, { id: "mmx-player-x", name: "MMX — X", version: 1 });
  assert.equal(game.schemaVersion, 1);
  assert.deepEqual(Object.keys(game), [
    "schemaVersion",
    "actors",
    "abilities",
    "loadouts",
    "weapons",
    "projectiles",
  ]);
  assert.deepEqual(Object.keys(game.actors), ["player.x"]);
  assert.deepEqual(Object.keys(game.abilities), [
    "player.idle",
    "player.walk",
    "player.fall",
    "player.wall-slide",
    "player.dash",
    "player.air-dash",
    "player.jump",
    "player.dash-jump",
    "player.wall-jump",
    "player.dash-wall-jump",
    "player.intro",
    "player.damage",
    "player.death",
    "player.shot",
    "player.charge",
  ]);
  assert.deepEqual(Object.keys(game.loadouts), ["player.x"]);
  assert.deepEqual(Object.keys(game.weapons), ["buster", "dark_arrow"]);
  assert.deepEqual(Object.keys(game.projectiles), ["lemon", "medium", "charged", "dark_arrow"]);
});
