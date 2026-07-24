import { test } from "node:test";
import assert from "node:assert/strict";

import type { LevelDocument, LevelObjectInstance } from "../src/index.js";
import { SCHEMA_VERSION, validateDocument } from "../src/index.js";

function baseDoc(objects: LevelObjectInstance[]): LevelDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "Test",
    name: "Test",
    gridSize: 16,
    cols: 8,
    rows: 8,
    tiles: new Array(64).fill(0),
    objects,
  };
}

const spawn = (id = "spawn-1"): LevelObjectInstance => ({
  id,
  definitionId: "spawn",
  x: 32,
  y: 32,
});

test("a minimal level with one spawn validates clean", () => {
  const result = validateDocument(baseDoc([spawn()]));
  assert.equal(result.ok, true);
  assert.equal(result.errorCount, 0);
});

test("missing or duplicate spawn is a fatal error", () => {
  assert.equal(validateDocument(baseDoc([])).ok, false);
  const two = validateDocument(baseDoc([spawn("a"), spawn("b")]));
  assert.equal(two.ok, false);
  assert.ok(two.issues.some((i) => i.code === "spawn.count"));
});

test("duplicate object ids are rejected", () => {
  const result = validateDocument(baseDoc([spawn("dup"), { ...spawn("dup"), x: 48 }]));
  assert.ok(result.issues.some((i) => i.code === "id.duplicate"));
});

test("unknown definition id is flagged", () => {
  const result = validateDocument(
    baseDoc([spawn(), { id: "x", definitionId: "does.not.exist", x: 0, y: 0 }]),
  );
  assert.ok(result.issues.some((i) => i.code === "definition.unknown"));
});

test("platform travel/speed must be non-negative", () => {
  const result = validateDocument(
    baseDoc([
      spawn(),
      {
        id: "p",
        definitionId: "platform.moving",
        x: 16,
        y: 16,
        width: 48,
        height: 8,
        overrides: { Travel: -5, Speed: 10 },
      },
    ]),
  );
  assert.ok(result.issues.some((i) => i.code === "field.nonNegative" && i.field === "Travel"));
});

test("camera zones must have positive dimensions", () => {
  const result = validateDocument(
    baseDoc([
      spawn(),
      { id: "cz", definitionId: "camera-zone", x: 0, y: 0, width: 0, height: 100 },
    ]),
  );
  assert.ok(result.issues.some((i) => i.code === "size.positive"));
});

test("tiles.length must equal cols*rows", () => {
  const doc = baseDoc([spawn()]);
  doc.tiles = [0, 0, 0];
  const result = validateDocument(doc);
  assert.ok(result.issues.some((i) => i.code === "tiles.length"));
});

test("out-of-bounds objects warn but do not block play", () => {
  const result = validateDocument(baseDoc([spawn(), { ...spawn("far"), x: 99999, y: 99999 }]));
  // Two spawns also errors, but the bounds warning must be present and be a warning.
  const bounds = result.issues.find((i) => i.code === "bounds");
  assert.ok(bounds);
  assert.equal(bounds.severity, "warning");
});
