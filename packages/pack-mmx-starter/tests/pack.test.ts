import { test } from "node:test";
import assert from "node:assert/strict";

import manifest from "../pack.json" with { type: "json" };
import game from "../data/game.json" with { type: "json" };

// Content equivalence with the built-ins is proved by @mmx/engine's pack-mmx-starter test.
test("the pack folder holds its manifest and a game data overlay", () => {
  assert.deepEqual(manifest, { id: "mmx-starter", name: "MMX Starter", version: 1 });
  assert.equal(game.schemaVersion, 1);
  assert.deepEqual(Object.keys(game.prefabs), [
    "enemy.metool",
    "enemy.bat",
    "enemy.pantheon",
    "pickup.life.small",
    "pickup.life.large",
    "pickup.weapon.small",
    "pickup.weapon.large",
    "platform.moving",
    "platform.falling",
    "conveyor",
  ]);
});
