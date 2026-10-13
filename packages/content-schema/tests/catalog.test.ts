import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { GAME_DATA, mergeGameData, type GameData } from "@mmx/engine/data";
import {
  OBJECT_DEFINITIONS,
  allDefinitions,
  definitionsFromGameData,
  getDefinition,
  isBuiltinDefinition,
  setCatalogGameData,
  setProjectDefinitions,
} from "../src/index.js";

/** The hand-written catalog as it was before it was generated from game data. */
const LEGACY_CATALOG = JSON.parse(
  readFileSync(new URL("./fixtures/builtin-definitions.json", import.meta.url), "utf8"),
);

test("the catalog generated from the default game data equals the hand-written one", () => {
  assert.deepStrictEqual(definitionsFromGameData(GAME_DATA), LEGACY_CATALOG);
  assert.deepStrictEqual(OBJECT_DEFINITIONS, LEGACY_CATALOG);
});

function withCrab(): GameData {
  const merged = mergeGameData(GAME_DATA, {
    actors: { crab: { ...GAME_DATA.actors[GAME_DATA.enemies.metool!.actor]!, id: "crab" } },
    enemies: {
      crab: {
        ...GAME_DATA.enemies.metool!,
        id: "crab",
        actor: "crab",
        sheet: "anim.enemy.crab",
        hurtbox: { hw: 12, hh: 6 },
      },
    },
    prefabs: {
      "enemy.crab": {
        ...GAME_DATA.prefabs["enemy.metool"]!,
        id: "enemy.crab",
        source: { kind: "enemy", ref: "crab" },
      },
    },
  });
  assert.ok(merged.ok);
  return merged.value;
}

test("setCatalogGameData makes a project enemy placeable and derivable", (t) => {
  t.after(() => {
    setProjectDefinitions([]);
    setCatalogGameData(GAME_DATA);
  });
  assert.deepEqual(
    setProjectDefinitions([{ id: "obj.crab.right", name: "Crab (right)", base: "enemy.crab" }]).map(
      (issue) => issue.code,
    ),
    ["object.base"],
  );

  // Re-derives the entries already set: the base now exists.
  assert.deepEqual(setCatalogGameData(withCrab()), []);
  const crab = getDefinition("enemy.crab")!;
  assert.ok(isBuiltinDefinition("enemy.crab"));
  assert.equal(crab.name, "Crab");
  assert.equal(crab.category, "enemy");
  assert.equal(crab.engineId, "Enemy");
  assert.deepEqual(crab.fields, { Kind: "crab" });
  assert.deepEqual(crab.defaultSize, { width: 24, height: 12 });
  assert.deepEqual(
    crab.properties.map((p) => [p.key, p.type, p.default]),
    [["FacesRight", "boolean", false]],
  );
  const ids = allDefinitions().map((d) => d.id);
  assert.equal(ids.indexOf("enemy.crab"), ids.indexOf("enemy.pantheon") + 1);

  assert.deepEqual(
    setProjectDefinitions([
      {
        id: "obj.crab.right",
        name: "Crab (right)",
        base: "enemy.crab",
        values: { FacesRight: true },
      },
    ]),
    [],
  );
  const derived = getDefinition("obj.crab.right")!;
  assert.equal(derived.baseId, "enemy.crab");
  assert.deepEqual(derived.fields, { Kind: "crab" });
  assert.equal(derived.properties[0]!.default, true);

  // Back to the default data: the crab and what derives from it drop out.
  assert.deepEqual(
    setCatalogGameData(GAME_DATA).map((issue) => issue.code),
    ["object.base"],
  );
  assert.equal(getDefinition("enemy.crab"), undefined);
  assert.equal(getDefinition("obj.crab.right"), undefined);
});
