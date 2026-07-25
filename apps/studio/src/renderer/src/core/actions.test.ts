import { describe, expect, it } from "vitest";
import { Tile } from "@mmx/engine/game/World.js";
import { createLevelDocument } from "@mmx/content-schema";
import { EditorStore } from "./EditorStore.js";
import {
  cellIndex,
  deleteSelection,
  duplicateSelection,
  nudgeSelection,
  paintTiles,
  placeAt,
  setTileAt,
} from "./actions.js";

function freshStore(): EditorStore {
  return new EditorStore(createLevelDocument());
}

describe("editor actions", () => {
  it("places a new instance and selects it", () => {
    const store = freshStore();
    const before = store.get().document.objects.length;
    placeAt(store, "enemy.metool", 100, 100);
    const state = store.get();
    expect(state.document.objects.length).toBe(before + 1);
    expect(state.selectedIds.length).toBe(1);
    const placed = state.document.objects.find((o) => o.id === state.selectedIds[0]);
    expect(placed?.definitionId).toBe("enemy.metool");
  });

  it("duplicates the selection offset by one grid cell", () => {
    const store = freshStore();
    placeAt(store, "enemy.metool", 100, 100);
    const original = store.get().document.objects.at(-1)!;
    const grid = store.get().document.gridSize;
    duplicateSelection(store);
    const copy = store.get().document.objects.at(-1)!;
    expect(copy.id).not.toBe(original.id);
    expect(copy.x).toBe(original.x + grid);
    expect(copy.y).toBe(original.y + grid);
  });

  it("deletes the selection and clears it", () => {
    const store = freshStore();
    placeAt(store, "enemy.metool", 100, 100);
    const count = store.get().document.objects.length;
    deleteSelection(store);
    expect(store.get().document.objects.length).toBe(count - 1);
    expect(store.get().selectedIds).toEqual([]);
  });

  it("undo/redo round-trips a placement", () => {
    const store = freshStore();
    const before = store.get().document.objects.length;
    placeAt(store, "enemy.metool", 100, 100);
    expect(store.canUndo).toBe(true);
    store.undo();
    expect(store.get().document.objects.length).toBe(before);
    store.redo();
    expect(store.get().document.objects.length).toBe(before + 1);
  });

  it("nudges the selection by a pixel delta", () => {
    const store = freshStore();
    placeAt(store, "enemy.metool", 100, 100);
    const id = store.get().selectedIds[0];
    const before = store.get().document.objects.find((o) => o.id === id)!;
    nudgeSelection(store, 4, -3);
    const after = store.get().document.objects.find((o) => o.id === id)!;
    expect(after.x).toBe(before.x + 4);
    expect(after.y).toBe(before.y - 3);
  });

  it("places and removes a solid tile, each as one undoable step", () => {
    const store = freshStore();
    const cols = store.get().document.cols;
    const index = cellIndex(store, 2, 3);
    expect(index).toBe(3 * cols + 2);

    setTileAt(store, 2, 3, true);
    expect(store.get().document.tiles[index!]).toBe(Tile.Solid);
    store.undo();
    expect(store.get().document.tiles[index!]).toBe(Tile.Empty);
    store.redo();
    expect(store.get().document.tiles[index!]).toBe(Tile.Solid);

    setTileAt(store, 2, 3, false);
    expect(store.get().document.tiles[index!]).toBe(Tile.Empty);
  });

  it("ignores an all-redundant paint stroke so history stays clean", () => {
    const store = freshStore();
    const index = cellIndex(store, 1, 1)!;
    setTileAt(store, 1, 1, true);
    const canUndoBefore = store.canUndo;
    // Painting the same cell solid again changes nothing.
    paintTiles(store, [{ index, value: Tile.Solid }], false);
    expect(store.canUndo).toBe(canUndoBefore);
    store.undo();
    expect(store.get().document.tiles[index]).toBe(Tile.Empty);
    expect(store.canUndo).toBe(false);
  });

  it("clamps out-of-bounds cells to a null index", () => {
    const store = freshStore();
    expect(cellIndex(store, -1, 0)).toBeNull();
    expect(cellIndex(store, 0, store.get().document.rows)).toBeNull();
  });

  it("snaps to the grid only when snapping is enabled", () => {
    const store = freshStore();
    expect(store.get().snapEnabled).toBe(true);
    expect(store.snap(19)).toBe(16);
    store.toggleSnap();
    expect(store.snap(19)).toBe(19);
  });
});
