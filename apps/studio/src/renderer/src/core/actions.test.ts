import { describe, expect, it } from "vitest";
import { createLevelDocument, TerrainTile } from "@mmx/content-schema";
import {
  EditorStore,
  selectedDecorationIds,
  selectedObjectIds,
  selectedTileIndices,
} from "./EditorStore.js";
import {
  cellIndex,
  deleteSelection,
  duplicateSelection,
  nudgeSelection,
  paintTiles,
  placeAt,
  placeDecorationAt,
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
    const ids = selectedObjectIds(state.selection);
    expect(ids.length).toBe(1);
    const placed = state.document.objects.find((o) => o.id === ids[0]);
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
    expect(selectedObjectIds(store.get().selection)).toEqual([]);
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
    const id = selectedObjectIds(store.get().selection)[0];
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
    expect(store.get().document.tiles[index!]).toBe(TerrainTile.Solid);
    store.undo();
    expect(store.get().document.tiles[index!]).toBe(TerrainTile.Empty);
    store.redo();
    expect(store.get().document.tiles[index!]).toBe(TerrainTile.Solid);

    setTileAt(store, 2, 3, false);
    expect(store.get().document.tiles[index!]).toBe(TerrainTile.Empty);
  });

  it("deletes selected solid tiles", () => {
    const store = freshStore();
    setTileAt(store, 2, 3, true);
    setTileAt(store, 3, 3, true);
    const a = cellIndex(store, 2, 3)!;
    const b = cellIndex(store, 3, 3)!;
    store.selectTiles([a, b]);
    expect(selectedTileIndices(store.get().selection)).toEqual([a, b]);
    deleteSelection(store);
    expect(store.get().document.tiles[a]).toBe(TerrainTile.Empty);
    expect(store.get().document.tiles[b]).toBe(TerrainTile.Empty);
    expect(selectedTileIndices(store.get().selection)).toEqual([]);
  });

  it("moves selected tiles by cell and updates selection", () => {
    const store = freshStore();
    setTileAt(store, 2, 3, true);
    const from = cellIndex(store, 2, 3)!;
    store.selectTiles([from]);
    nudgeSelection(store, store.get().document.gridSize, 0);
    const to = cellIndex(store, 3, 3)!;
    expect(store.get().document.tiles[from]).toBe(TerrainTile.Empty);
    expect(store.get().document.tiles[to]).toBe(TerrainTile.Solid);
    expect(selectedTileIndices(store.get().selection)).toEqual([to]);
  });

  it("ignores an all-redundant paint stroke so history stays clean", () => {
    const store = freshStore();
    const index = cellIndex(store, 1, 1)!;
    setTileAt(store, 1, 1, true);
    const canUndoBefore = store.canUndo;
    paintTiles(store, [{ index, value: TerrainTile.Solid }], false);
    expect(store.canUndo).toBe(canUndoBefore);
    store.undo();
    expect(store.get().document.tiles[index]).toBe(TerrainTile.Empty);
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

  it("places a decoration and selects it", () => {
    const store = freshStore();
    const before = store.get().document.decorations.length;
    placeDecorationAt(store, "prop.life-capsule", 50, 60);
    const state = store.get();
    expect(state.document.decorations.length).toBe(before + 1);
    const ids = selectedDecorationIds(state.selection);
    expect(ids.length).toBe(1);
    const placed = state.document.decorations.find((d) => d.id === ids[0]);
    expect(placed?.assetId).toBe("prop.life-capsule");
  });

  it("duplicates a decoration selection offset by one grid cell", () => {
    const store = freshStore();
    placeDecorationAt(store, "prop.life-capsule", 50, 60);
    const original = store.get().document.decorations.at(-1)!;
    const grid = store.get().document.gridSize;
    duplicateSelection(store);
    const copy = store.get().document.decorations.at(-1)!;
    expect(copy.id).not.toBe(original.id);
    expect(copy.x).toBe(original.x + grid);
    expect(copy.y).toBe(original.y + grid);
  });

  it("deletes a decoration selection and clears it", () => {
    const store = freshStore();
    placeDecorationAt(store, "prop.life-capsule", 50, 60);
    const count = store.get().document.decorations.length;
    deleteSelection(store);
    expect(store.get().document.decorations.length).toBe(count - 1);
    expect(selectedDecorationIds(store.get().selection)).toEqual([]);
  });

  it("undoes a decoration placement", () => {
    const store = freshStore();
    const before = store.get().document.decorations.length;
    placeDecorationAt(store, "prop.life-capsule", 50, 60);
    expect(store.get().document.decorations.length).toBe(before + 1);
    store.undo();
    expect(store.get().document.decorations.length).toBe(before);
    store.redo();
    expect(store.get().document.decorations.length).toBe(before + 1);
  });

  it("nudges a decoration selection by pixel delta", () => {
    const store = freshStore();
    placeDecorationAt(store, "prop.life-capsule", 50, 60);
    const id = selectedDecorationIds(store.get().selection)[0];
    const before = store.get().document.decorations.find((d) => d.id === id)!;
    nudgeSelection(store, 3, -2);
    const after = store.get().document.decorations.find((d) => d.id === id)!;
    expect(after.x).toBe(before.x + 3);
    expect(after.y).toBe(before.y - 2);
  });
});
