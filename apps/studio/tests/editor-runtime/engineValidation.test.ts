import { test } from "node:test";
import assert from "node:assert/strict";

import {
  OBJECT_DEFINITIONS,
  createLevelDocument,
  setCatalogGameData,
  setProjectDefinitions,
  type LevelDocument,
  type LevelObjectInstance,
} from "@mmx/content-schema";
import {
  documentToLevelData,
  engineDiagnostics,
  validateLevelDocument,
} from "../../src/editor-runtime/adapters/index.js";
import { GAME_DATA } from "@mmx/engine/data";
import { addEnemy, projectGameData } from "../../src/renderer/src/core/gameData.js";

function docWith(objects: LevelObjectInstance[]): LevelDocument {
  const doc = createLevelDocument();
  return { ...doc, objects: [...doc.objects, ...objects] };
}

const platform = (over: Partial<LevelObjectInstance> = {}): LevelObjectInstance => ({
  id: "plat-1",
  definitionId: "platform.moving",
  x: 96,
  y: 96,
  width: 48,
  height: 8,
  ...over,
});

test("engine diagnostics map entityId → objectId and field → field", () => {
  const issues = engineDiagnostics(docWith([platform({ overrides: { Speed: -5 } })]));
  const issue = issues.find((i) => i.code === "field.nonNegative");
  assert.ok(issue, "expected the negative-speed diagnostic");
  assert.equal(issue?.objectId, "plat-1");
  assert.equal(issue?.field, "Speed");
  assert.equal(issue?.severity, "error");
});

test("an object wholly outside the level is an out-of-bounds error, reported once", () => {
  const doc = createLevelDocument();
  const enemy: LevelObjectInstance = {
    id: "metool-1",
    definitionId: "enemy.metool",
    x: doc.cols * doc.gridSize + 200,
    y: 32,
  };
  const outside = validateLevelDocument(docWith([enemy]));
  assert.equal(outside.ok, false);
  const forEnemy = outside.issues.filter((i) => i.objectId === "metool-1");
  assert.deepEqual(
    forEnemy.map((i) => [i.severity, i.code]),
    [["error", "object.out-of-bounds"]],
  );

  const inside = validateLevelDocument(docWith([{ ...enemy, x: 64 }]));
  assert.equal(inside.ok, true);
});

test("engine errors block Play", () => {
  const bad = validateLevelDocument(docWith([platform({ overrides: { Speed: -5 } })]));
  assert.equal(bad.ok, false);
  assert.ok(bad.errorCount >= 1);
});

test("authoring and engine agree on missing Spawn, and it is reported once", () => {
  const noSpawn: LevelDocument = { ...createLevelDocument(), objects: [] };
  const result = validateLevelDocument(noSpawn);
  const spawnIssues = result.issues.filter((i) => i.code === "spawn.count");
  assert.equal(spawnIssues.length, 1, "the equivalent diagnostic must be deduplicated");
  assert.equal(result.ok, false);
});

test("a clean document produces no issues through the combined validator", () => {
  const result = validateLevelDocument(createLevelDocument());
  assert.equal(result.ok, true);
  assert.equal(result.errorCount, 0);
});

test("engineDiagnostics is empty when conversion itself fails (authoring reports the cause)", () => {
  const doc = docWith([{ id: "x1", definitionId: "not-a-real-def", x: 10, y: 10 }]);
  assert.deepEqual(engineDiagnostics(doc), []);
  const combined = validateLevelDocument(doc);
  assert.equal(combined.ok, false);
  assert.ok(combined.issues.some((i) => i.code === "definition.unknown"));
});

test("the engine accepts a default instance of every definition (schema and engine agree)", () => {
  for (const def of OBJECT_DEFINITIONS) {
    if (def.id === "spawn") continue;
    const doc = docWith([{ id: "o1", definitionId: def.id, x: 96, y: 96 }]);
    assert.deepEqual(
      engineDiagnostics(doc).filter((d) => d.severity === "error"),
      [],
      def.id,
    );
  }
});

test("instances of project object definitions compile to engine entities the engine accepts", () => {
  setProjectDefinitions([
    {
      id: "obj.fast",
      name: "Fast",
      base: "platform.moving",
      values: { Speed: 120 },
      exposed: ["Travel"],
    },
  ]);
  try {
    const doc = docWith([
      { id: "f1", definitionId: "obj.fast", x: 96, y: 96, width: 48, height: 8 },
    ]);
    const entity = documentToLevelData(doc).entities.find((e) => e.iid === "f1");
    assert.equal(entity?.id, "MovingPlatform");
    assert.deepEqual(entity?.fields, { Speed: 120, Travel: 96, Axis: "horizontal" });
    assert.deepEqual(
      engineDiagnostics(doc).filter((d) => d.severity === "error"),
      [],
    );
  } finally {
    setProjectDefinitions([]);
  }
});

test("a project enemy is checked against the compiled game data Play uses", (t) => {
  const { overlay } = addEnemy(undefined, GAME_DATA, {
    name: "Crab",
    base: "metool",
    sheet: "anim.crab",
    health: 3,
    touchDamage: 2,
  });
  const { data, compiled } = projectGameData(overlay);
  setCatalogGameData(data);
  t.after(() => setCatalogGameData(GAME_DATA));

  const doc = docWith([{ id: "crab-1", definitionId: "enemy.crab", x: 64, y: 32 }]);
  const result = validateLevelDocument(doc, undefined, compiled);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  const unknown = engineDiagnostics(doc).filter((i) => i.severity === "error");
  assert.ok(
    unknown.some((i) => i.objectId === "crab-1"),
    JSON.stringify(unknown),
  );
});

test("a placed enemy whose sheet Play has no animation for is an error, before Play", () => {
  const doc = docWith([{ id: "metool-1", definitionId: "enemy.metool", x: 64, y: 32 }]);
  const unbound = validateLevelDocument(doc, undefined, undefined, new Set(["bat"]));
  assert.equal(unbound.ok, false);
  assert.deepEqual(
    unbound.issues.filter((i) => i.code === "enemy.animation").map((i) => [i.severity, i.objectId]),
    [["error", "metool-1"]],
  );
  assert.equal(validateLevelDocument(doc, undefined, undefined, new Set(["metool"])).ok, true);
  // Unchecked without the sheet list (no assets loaded yet).
  assert.equal(validateLevelDocument(doc).ok, true);
});
