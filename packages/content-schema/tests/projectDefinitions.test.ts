import { test } from "node:test";
import assert from "node:assert/strict";

import {
  OBJECT_DEFINITIONS,
  SCHEMA_VERSION,
  TerrainTile,
  allDefinitions,
  definitionFor,
  effectiveValue,
  entityFields,
  instanceSize,
  getDefinition,
  setProjectDefinitions,
  validateDocument,
  type ProjectDefinitionEntry,
} from "../src/index.js";

const fast: ProjectDefinitionEntry = {
  id: "obj.fast",
  name: "Fast platform",
  base: "platform.moving",
  values: { Speed: 120 },
  exposed: ["Travel"],
};

test("a project definition fixes hidden values and re-defaults exposed ones", (t) => {
  t.after(() => setProjectDefinitions([]));
  assert.deepEqual(setProjectDefinitions([{ ...fast, values: { Speed: 120, Travel: 32 } }]), []);

  const def = getDefinition("obj.fast")!;
  assert.equal(def.baseId, "platform.moving");
  assert.equal(def.engineId, "MovingPlatform");
  assert.deepEqual(def.fields, { Speed: 120, Axis: "horizontal" });
  assert.deepEqual(
    def.properties.map((p) => [p.key, p.default]),
    [["Travel", 32]],
  );
  assert.deepEqual(entityFields({ id: "i", definitionId: "obj.fast", x: 0, y: 0 }), {
    Speed: 120,
    Axis: "horizontal",
    Travel: 32,
  });
  // A hidden property cannot be overridden per instance.
  assert.deepEqual(
    entityFields({ id: "i", definitionId: "obj.fast", x: 0, y: 0, overrides: { Speed: 1 } }),
    { Speed: 120, Axis: "horizontal", Travel: 32 },
  );
  assert.equal(allDefinitions().at(-1)?.id, "obj.fast");
});

test("without exposed, every base property stays editable", (t) => {
  t.after(() => setProjectDefinitions([]));
  setProjectDefinitions([
    { id: "obj.bat", name: "Right bat", base: "enemy.bat", values: { FacesRight: true } },
  ]);
  const def = getDefinition("obj.bat")!;
  assert.deepEqual(def.fields, { Kind: "bat" });
  assert.deepEqual(
    def.properties.map((p) => [p.key, p.default]),
    [["FacesRight", true]],
  );
});

test("invalid entries are reported; only underivable ones are left out of the catalog", (t) => {
  t.after(() => setProjectDefinitions([]));
  const issues = setProjectDefinitions([
    { id: "enemy.bat", name: "Clash", base: "enemy.bat" },
    { id: "obj.spawn", name: "Spawn 2", base: "spawn" },
    { id: "obj.none", name: "Nothing", base: "does.not.exist" },
    { ...fast, id: "obj.badkey", exposed: ["Nope"], values: { Other: 1 } },
    { ...fast, id: "obj.badval", values: { Speed: -1 } },
    fast,
  ]);
  assert.deepEqual(
    issues.map((i) => [i.index, i.code]),
    [
      [0, "object.id.reserved"],
      [1, "object.base"],
      [2, "object.base"],
      [3, "object.exposed"],
      [3, "object.values"],
      [4, "field.nonNegative"],
    ],
  );
  // Derivable entries stay registered so their instances render; the issue blocks builds.
  assert.equal(getDefinition("obj.badval")?.fields.Speed, -1);
  assert.equal(getDefinition("obj.none"), undefined);
  assert.equal(getDefinition("obj.spawn"), undefined);
  assert.equal(
    getDefinition("enemy.bat"),
    OBJECT_DEFINITIONS.find((d) => d.id === "enemy.bat"),
  );
  assert.ok(getDefinition("obj.fast"));
});

test("levels validate instances of project definitions, and flag them once the definition is gone", (t) => {
  t.after(() => setProjectDefinitions([]));
  setProjectDefinitions([fast]);
  const doc = {
    schemaVersion: SCHEMA_VERSION,
    id: "T",
    name: "T",
    gridSize: 16,
    cols: 32,
    rows: 32,
    tiles: new Array(32 * 32).fill(TerrainTile.Empty),
    objects: [
      { id: "s", definitionId: "spawn", x: 32, y: 32 },
      { id: "p", definitionId: "obj.fast", x: 64, y: 64, overrides: { Travel: -4, Speed: 5 } },
    ],
    decorations: [],
  };
  assert.deepEqual(
    validateDocument(doc).issues.map((i) => [i.code, i.field]),
    [
      ["field.nonNegative", "Travel"],
      ["field.unknown", "Speed"],
    ],
  );
  setProjectDefinitions([]);
  assert.ok(validateDocument(doc).issues.some((i) => i.code === "definition.unknown"));
});

test("editor reads tolerate a missing definition; compilation still refuses it", () => {
  const ghost = { id: "g", definitionId: "obj.gone", x: 0, y: 0 };
  assert.equal(definitionFor("obj.gone").category, "unknown");
  assert.deepEqual(instanceSize(ghost), { width: 16, height: 16 });
  assert.equal(effectiveValue(ghost, "Speed"), undefined);
  assert.throws(() => entityFields(ghost), /unknown definition id 'obj\.gone'/);
});

test("a duplicate project id keeps only the first entry", (t) => {
  t.after(() => setProjectDefinitions([]));
  const issues = setProjectDefinitions([fast, { ...fast, name: "Twin" }]);
  assert.deepEqual(
    issues.map((i) => [i.index, i.code]),
    [[1, "object.id.duplicate"]],
  );
  assert.equal(allDefinitions().filter((d) => d.id === "obj.fast").length, 1);
  assert.equal(getDefinition("obj.fast")?.name, "Fast platform");
});
