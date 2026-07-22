import { test } from "node:test";
import assert from "node:assert/strict";

import type { LevelDocument, LevelObjectInstance } from "../src/index.js";
import {
  History,
  SCHEMA_VERSION,
  addObjects,
  deleteObjects,
  moveObjects,
  setProperty,
  setTransform,
} from "../src/index.js";

function doc(objects: LevelObjectInstance[]): LevelDocument {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "T",
    name: "T",
    gridSize: 16,
    cols: 8,
    rows: 8,
    tiles: new Array(64).fill(0),
    objects,
  };
}

const a: LevelObjectInstance = { id: "a", definitionId: "spawn", x: 0, y: 0 };
const b: LevelObjectInstance = { id: "b", definitionId: "enemy.metool", x: 32, y: 32 };

test("move collapses a drag to one entry and inverts exactly", () => {
  const h = new History(doc([a, b]));
  h.execute(moveObjects(["b"], 16, -8));
  assert.deepEqual(h.document.objects[1], { ...b, x: 48, y: 24 });
  h.undo();
  assert.deepEqual(h.document.objects[1], b);
  h.redo();
  assert.deepEqual(h.document.objects[1], { ...b, x: 48, y: 24 });
});

test("history tracks undo/redo availability", () => {
  const h = new History(doc([a]));
  assert.equal(h.canUndo, false);
  h.execute(moveObjects(["a"], 1, 1));
  assert.equal(h.canUndo, true);
  assert.equal(h.canRedo, false);
  h.undo();
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, true);
});

test("delete then undo restores objects at their original index", () => {
  const c: LevelObjectInstance = { id: "c", definitionId: "hazard", x: 64, y: 64 };
  const h = new History(doc([a, b, c]));
  h.execute(deleteObjects(h.document, ["b"]));
  assert.deepEqual(
    h.document.objects.map((o) => o.id),
    ["a", "c"],
  );
  h.undo();
  assert.deepEqual(
    h.document.objects.map((o) => o.id),
    ["a", "b", "c"],
  );
});

test("setProperty on an override is reversible and drops empty override maps", () => {
  const h = new History(doc([b]));
  h.execute(setProperty("b", "FacesRight", "override", undefined, true));
  assert.equal(h.document.objects[0].overrides?.FacesRight, true);
  h.undo();
  assert.equal(h.document.objects[0].overrides, undefined);
});

test("setTransform patches and reverts resize", () => {
  const p: LevelObjectInstance = {
    id: "p",
    definitionId: "hazard",
    x: 0,
    y: 0,
    width: 16,
    height: 16,
  };
  const h = new History(doc([p]));
  h.execute(setTransform("p", { width: 16, height: 16 }, { width: 64, height: 8 }));
  assert.equal(h.document.objects[0].width, 64);
  assert.equal(h.document.objects[0].height, 8);
  h.undo();
  assert.equal(h.document.objects[0].width, 16);
});

test("addObjects appends and undo removes exactly those ids", () => {
  const h = new History(doc([a]));
  const added: LevelObjectInstance = { id: "z", definitionId: "hazard", x: 1, y: 1 };
  h.execute(addObjects([added], "Duplicate"));
  assert.equal(h.document.objects.length, 2);
  h.undo();
  assert.deepEqual(
    h.document.objects.map((o) => o.id),
    ["a"],
  );
});

test("executing after an undo clears the redo stack", () => {
  const h = new History(doc([a]));
  h.execute(moveObjects(["a"], 5, 0));
  h.undo();
  h.execute(moveObjects(["a"], 0, 5));
  assert.equal(h.canRedo, false);
  assert.deepEqual(h.document.objects[0], { ...a, y: 5 });
});
