import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createLevelDocument,
  type LevelDocument,
  type LevelObjectInstance,
} from "@mmx/content-schema";
import { engineDiagnostics, validateLevelDocument } from "../src/index.js";

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

test("engine warnings do not block Play, engine errors do", () => {
  const outside = validateLevelDocument(docWith([platform({ x: 100000 })]));
  assert.equal(outside.ok, true);
  assert.ok(outside.issues.some((i) => i.severity === "warning" && i.code === "bounds"));

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
