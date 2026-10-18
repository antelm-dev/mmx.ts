import { test } from "node:test";
import assert from "node:assert/strict";

import manifest from "../pack.json" with { type: "json" };
import game from "../data/game.json" with { type: "json" };
import assets from "../assets.json" with { type: "json" };
import bindings from "../bindings.json" with { type: "json" };

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

test("bindings.json binds the pack's sheets to its own animation entries", () => {
  const ids = new Set(assets.assets.filter((a) => a.kind === "animation").map((a) => a.id));
  const sheets = (category: "enemies" | "pickups") =>
    Object.values(game[category]).map((record) => record.sheet);
  assert.deepEqual(Object.keys(bindings), ["enemyAnimations", "pickupAnimations"]);
  for (const [group, category] of [
    ["enemyAnimations", "enemies"],
    ["pickupAnimations", "pickups"],
  ] as const) {
    for (const [sheet, id] of Object.entries(bindings[group])) {
      assert.ok(sheets(category).includes(sheet), sheet);
      assert.ok(ids.has(id), id);
    }
  }
});
