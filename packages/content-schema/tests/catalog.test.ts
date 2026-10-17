import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { GAME_DATA, mergeGameData, type GameData } from "@mmx/engine/data";
import {
  OBJECT_DEFINITIONS,
  allDefinitions,
  catalogGameData,
  definitionFor,
  definitionsFromGameData,
  getDefinition,
  isBaseDefinition,
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

test("a project prefab's name is its display name; built-in presentation still wins", () => {
  const data = structuredClone(withCrab());
  data.prefabs["enemy.crab"]!.name = "Spiky Crab";
  data.prefabs["enemy.metool"]!.name = "Ignored";
  const byId = new Map(definitionsFromGameData(data).map((d) => [d.id, d]));
  assert.equal(byId.get("enemy.crab")!.name, "Spiky Crab");
  assert.equal(byId.get("enemy.metool")!.name, "Metool");
});

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
  assert.deepEqual(crab.components, { enemy: { kind: "crab", sheet: "anim.enemy.crab" } });
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

/** The default data with only spawn, hazard and camera zone placeable: none of the pack's objects (C-INDEP). */
function baseWithoutPack(): GameData {
  const keep = (id: string) => id === "hazard" || id === "camera-zone";
  const environments = Object.fromEntries(
    Object.entries(GAME_DATA.environments).filter(([id]) => keep(id)),
  );
  const prefabs = Object.fromEntries(
    Object.entries(GAME_DATA.prefabs).filter(
      ([, { source }]) =>
        source.kind === "loadout" || (source.kind === "environment" && keep(source.ref)),
    ),
  );
  return { ...GAME_DATA, enemies: {}, pickups: {}, environments, prefabs };
}

test("a base without the pack's objects gives the primitives' catalog, and new prefabs fall back", (t) => {
  t.after(() => setCatalogGameData(GAME_DATA));
  const base = baseWithoutPack();
  assert.deepEqual(
    definitionsFromGameData(base).map((d) => d.id),
    ["spawn", "hazard", "slope", "camera-zone"],
  );
  const lift = {
    ...base,
    environments: {
      ...base.environments,
      lift: { id: "lift", behavior: "environment.moving-platform", defaults: {} },
    },
    prefabs: {
      ...base.prefabs,
      "platform.lift": {
        id: "platform.lift",
        runtime: "environment",
        source: { kind: "environment", ref: "lift" },
        fields: [],
      },
    },
  } satisfies GameData;
  assert.deepEqual(setCatalogGameData(lift), []);
  assert.equal(catalogGameData(), lift);
  const def = definitionFor("platform.lift");
  assert.equal(def.name, "Lift");
  assert.equal(def.icon, "▭");
  assert.equal(def.engineId, "MovingPlatform");
  assert.deepEqual(def.defaultSize, { width: 48, height: 8 });
  assert.equal(definitionFor("enemy.metool").category, "unknown");
});

test("Base is what neither the project's data nor its objects add", (t) => {
  t.after(() => {
    setProjectDefinitions([]);
    setCatalogGameData(GAME_DATA);
  });
  const overlay = { prefabs: { "enemy.crab": withCrab().prefabs["enemy.crab"]! } };
  setCatalogGameData(withCrab(), overlay);
  setProjectDefinitions([{ id: "obj.crab.right", name: "Crab (right)", base: "enemy.crab" }]);
  const base = (id: string) => isBaseDefinition(definitionFor(id));
  assert.equal(base("enemy.crab"), false);
  assert.equal(base("obj.crab.right"), false);
  for (const id of ["spawn", "hazard", "slope", "camera-zone", "enemy.metool"])
    assert.equal(base(id), true, id);
  // Without an overlay (none, or a broken one) every built-in is Base again.
  setCatalogGameData(withCrab());
  assert.equal(base("enemy.crab"), true);
});
