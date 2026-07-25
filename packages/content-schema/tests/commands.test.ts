import { test } from "node:test";
import assert from "node:assert/strict";

import type { LevelDocument, LevelObjectInstance } from "../src/index.js";
import {
  History,
  SCHEMA_VERSION,
  addObjects,
  deleteObjects,
  moveObjects,
  setLevelSettings,
  setProperty,
  setTiles,
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

test("setTiles paints a stroke and undo restores every prior value", () => {
  const h = new History(doc([]));
  const start = h.document.tiles;
  h.execute(
    setTiles(h.document, [
      { index: 0, value: 1 },
      { index: 9, value: 1 },
    ]),
  );
  assert.equal(h.document.tiles[0], 1);
  assert.equal(h.document.tiles[9], 1);
  assert.notEqual(h.document.tiles, start, "returns a fresh tiles array so renderers redraw");
  h.undo();
  assert.equal(h.document.tiles[0], 0);
  assert.equal(h.document.tiles[9], 0);
});

test("setTiles drops cells already at their target value", () => {
  const tiles = new Array(64).fill(0);
  tiles[5] = 1;
  const base: LevelDocument = { ...doc([]), tiles };
  // Cell 5 is already solid; only cell 6 is a real change.
  const cmd = setTiles(base, [
    { index: 5, value: 1 },
    { index: 6, value: 1 },
  ]);
  const painted = cmd.execute(base);
  const reverted = cmd.undo(painted);
  assert.equal(reverted.tiles[5], 1, "undo must not clear a cell the command never touched");
  assert.equal(reverted.tiles[6], 0);
});

test("setLevelSettings edits name and grid without touching terrain", () => {
  const h = new History(doc([a]));
  const tiles = h.document.tiles;
  h.execute(setLevelSettings(h.document, { name: "Room 2", gridSize: 32, cols: 8, rows: 8 }));
  assert.equal(h.document.name, "Room 2");
  assert.equal(h.document.gridSize, 32);
  assert.equal(h.document.tiles, tiles, "no resize means the same tiles array");
  h.undo();
  assert.equal(h.document.name, "T");
  assert.equal(h.document.gridSize, 16);
});

test("setLevelSettings reshapes terrain, keeping cells by (col, row)", () => {
  const tiles = new Array(64).fill(0);
  tiles[0] = 1; // (col 0, row 0) — kept
  tiles[7] = 1; // (col 7, row 0) — cropped when cols shrinks to 4
  tiles[8] = 1; // (col 0, row 1) — kept, re-keyed to index 4 on a 4-wide grid
  const base: LevelDocument = { ...doc([]), tiles };
  const h = new History(base);
  h.execute(setLevelSettings(base, { name: "T", gridSize: 16, cols: 4, rows: 4 }));
  assert.equal(h.document.tiles.length, 16);
  assert.equal(h.document.tiles[0], 1);
  assert.equal(h.document.tiles[4], 1, "(0,1) lands at row*newCols + col = 4");
  assert.equal(h.document.tiles.filter((t) => t === 1).length, 2, "the (7,0) cell was cropped");
  h.undo();
  assert.equal(h.document.tiles, tiles, "undo restores the original terrain array");
  assert.equal(h.document.cols, 8);
});

test("setLevelSettings re-keys slopes onto the resized grid", () => {
  const base: LevelDocument = { ...doc([]), slopes: { 8: [0, 8], 7: [8, 0] } };
  const h = new History(base);
  h.execute(setLevelSettings(base, { name: "T", gridSize: 16, cols: 4, rows: 4 }));
  assert.deepEqual(h.document.slopes, { 4: [0, 8] }, "(0,1) re-keys to 4; (7,0) is cropped away");
  h.undo();
  assert.deepEqual(h.document.slopes, { 8: [0, 8], 7: [8, 0] });
});

test("executing after an undo clears the redo stack", () => {
  const h = new History(doc([a]));
  h.execute(moveObjects(["a"], 5, 0));
  h.undo();
  h.execute(moveObjects(["a"], 0, 5));
  assert.equal(h.canRedo, false);
  assert.deepEqual(h.document.objects[0], { ...a, y: 5 });
});
