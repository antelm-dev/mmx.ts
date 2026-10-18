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
import type { GameObjectDefinition } from "../src/types.js";
import { MMX_GAME_DATA as MMX } from "./support/mmx.js";

/** The hand-written catalog as it was before it was generated from game data: the engine's part, then the MMX Starter's. */
const fixture = (name: string) =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const LEGACY_CATALOG = fixture("builtin-definitions.json");
const LEGACY_MMX_CATALOG = fixture("mmx-starter-definitions.json");

/** `defs` by id, without the descriptions the hand-written catalog had none of. */
const byId = (defs: readonly GameObjectDefinition[]) =>
  defs.map(({ description: _description, ...d }) => d).sort((a, b) => a.id.localeCompare(b.id));

/** What New object…'s Behaviour step said of each object when it was hard-coded in Studio. */
const LEGACY_DESCRIPTIONS: Record<string, string> = {
  "pickup.life.small": "Restores a little life.",
  "pickup.life.large": "Restores a lot of life.",
  "pickup.weapon.small": "Refills a little weapon energy.",
  "pickup.weapon.large": "Refills a lot of weapon energy.",
  "platform.moving": "One-way floor that travels between two points, carrying the player.",
  "platform.falling": "One-way floor that drops after a delay once the player lands on it.",
  conveyor: "Strip that pushes the player along while they stand on it.",
  hazard:
    "Spikes: touching them kills the player unless the player is invulnerable; with Lethal off they deal Damage instead.",
  slope: "Ramp baked into the terrain, walked up and down.",
  "camera-zone": "Keeps the camera inside its area while the player is in it.",
};

const descriptions = (defs: readonly GameObjectDefinition[]) =>
  Object.fromEntries(defs.flatMap((d) => (d.description ? [[d.id, d.description]] : [])));

test("the catalog generated from the default game data equals the hand-written one", () => {
  assert.deepStrictEqual(byId(definitionsFromGameData(GAME_DATA)), byId(LEGACY_CATALOG));
  assert.deepStrictEqual(byId(OBJECT_DEFINITIONS), byId(LEGACY_CATALOG));
  assert.deepStrictEqual(
    byId(definitionsFromGameData(MMX)),
    byId([...LEGACY_CATALOG, ...LEGACY_MMX_CATALOG]),
  );
  assert.deepStrictEqual(
    definitionsFromGameData(GAME_DATA).map((d) => d.id),
    LEGACY_CATALOG.map((d: GameObjectDefinition) => d.id),
  );
});

test("names and descriptions come from the prefabs, as they were hard-coded", () => {
  for (const prefab of Object.values(MMX.prefabs)) assert.ok(prefab.name, prefab.id);
  assert.deepStrictEqual(descriptions(definitionsFromGameData(MMX)), LEGACY_DESCRIPTIONS);
});

test("a project whose copied prefabs have no name or description still shows the built-in names", () => {
  const old = structuredClone(MMX);
  for (const prefab of Object.values(old.prefabs)) {
    delete prefab.name;
    delete prefab.description;
  }
  const defs = definitionsFromGameData(old);
  assert.deepStrictEqual(byId(defs), byId([...LEGACY_CATALOG, ...LEGACY_MMX_CATALOG]));
  const names = new Map(defs.map((d) => [d.id, d.name]));
  assert.equal(names.get("enemy.metool"), "Metool");
  assert.equal(names.get("enemy.pantheon"), "Pantheon Hunter");
  // Studio's BEHAVIOUR_DESCRIPTIONS stand in for the descriptions; only the slope keeps its own.
  assert.deepStrictEqual(descriptions(defs), { slope: LEGACY_DESCRIPTIONS.slope });
});

function withCrab(): GameData {
  const { name: _name, ...metool } = MMX.prefabs["enemy.metool"]!;
  const merged = mergeGameData(MMX, {
    actors: { crab: { ...MMX.actors[MMX.enemies.metool!.actor]!, id: "crab" } },
    enemies: {
      crab: {
        ...MMX.enemies.metool!,
        id: "crab",
        actor: "crab",
        sheet: "anim.enemy.crab",
        hurtbox: { hw: 12, hh: 6 },
      },
    },
    prefabs: {
      "enemy.crab": {
        ...metool,
        id: "enemy.crab",
        source: { kind: "enemy", ref: "crab" },
      },
    },
  });
  assert.ok(merged.ok);
  return merged.value;
}

test("a prefab's own name and description win over the built-in presentation", () => {
  const data = structuredClone(withCrab());
  data.prefabs["enemy.crab"]!.name = "Spiky Crab";
  data.prefabs["enemy.pantheon"]!.name = "Hunter";
  data.prefabs["conveyor"]!.description = "Moves you.";
  const defs = new Map(definitionsFromGameData(data).map((d) => [d.id, d]));
  assert.equal(defs.get("enemy.crab")!.name, "Spiky Crab");
  assert.equal(defs.get("enemy.pantheon")!.name, "Hunter");
  assert.equal(defs.get("conveyor")!.description, "Moves you.");
  // Icon and default size still come from the presentation table.
  assert.equal(defs.get("enemy.pantheon")!.icon, "◆");
  assert.deepStrictEqual(defs.get("enemy.pantheon")!.defaultSize, { width: 16, height: 32 });
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

test("the engine's data, without the pack, gives the primitives' catalog, and new prefabs fall back", (t) => {
  t.after(() => setCatalogGameData(GAME_DATA));
  const base = GAME_DATA;
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
