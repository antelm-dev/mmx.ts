import { test } from "node:test";
import assert from "node:assert/strict";

import { createLevelDocument, SCHEMA_VERSION, validateDocument } from "../src/index.js";

test("createLevelDocument produces a valid, playable level", () => {
  const doc = createLevelDocument();
  const result = validateDocument(doc);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.errorCount, 0);
});

test("createLevelDocument stamps the current schema version and a fresh id", () => {
  const a = createLevelDocument();
  const b = createLevelDocument();
  assert.equal(a.schemaVersion, SCHEMA_VERSION);
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.objects[0].id, b.objects[0].id);
});

test("createLevelDocument has exactly one spawn and a matching tile count", () => {
  const doc = createLevelDocument();
  assert.equal(doc.tiles.length, doc.cols * doc.rows);
  assert.equal(doc.objects.filter((o) => o.definitionId === "spawn").length, 1);
});

test("createLevelDocument lays a solid floor along the bottom row", () => {
  const doc = createLevelDocument();
  const floorRow = doc.rows - 1;
  for (let col = 0; col < doc.cols; col++) {
    assert.equal(doc.tiles[floorRow * doc.cols + col], 1);
  }
  // The row above the floor is empty.
  assert.equal(doc.tiles[(floorRow - 1) * doc.cols], 0);
});

test("createLevelDocument honours overrides", () => {
  const doc = createLevelDocument({ name: "  My Stage  ", cols: 20, rows: 12, gridSize: 32 });
  assert.equal(doc.name, "My Stage");
  assert.equal(doc.cols, 20);
  assert.equal(doc.rows, 12);
  assert.equal(doc.gridSize, 32);
  assert.equal(doc.tiles.length, 240);
});
