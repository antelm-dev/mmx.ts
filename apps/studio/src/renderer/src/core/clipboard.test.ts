import { beforeEach, describe, expect, it } from "vitest";
import {
  addObjects,
  createLevelDocument,
  TerrainTile,
  setCatalogGameData,
} from "@mmx/content-schema";
import { EditorStore, selectedObjectIds, selectedTileIndices } from "./EditorStore.js";
import { placeAt, placeDecorationAt } from "./actions.js";
import { clearClipboard, copySelection, cutSelection, pasteClipboard } from "./clipboard.js";
import { MMX_GAME_DATA } from "./mmx.test-support.js";

// An MMX project's catalog: these tests place its objects.
setCatalogGameData(MMX_GAME_DATA);

function storeWithTwoMetools(): { store: EditorStore; ids: string[] } {
  const store = new EditorStore(createLevelDocument());
  placeAt(store, "enemy.metool", 64, 64);
  const a = selectedObjectIds(store.get().selection)[0]!;
  placeAt(store, "enemy.metool", 128, 96);
  const b = selectedObjectIds(store.get().selection)[0]!;
  store.selectObjects([a, b]);
  return { store, ids: [a, b] };
}

const objectsOf = (store: EditorStore) => store.get().document.objects;

describe("clipboard", () => {
  beforeEach(() => clearClipboard());

  it("pastes nothing before a copy", () => {
    const { store } = storeWithTwoMetools();
    const before = store.get().document;
    expect(pasteClipboard(store)).toBeUndefined();
    expect(store.get().document).toBe(before);
  });

  it("pastes copies with new ids one cell down-right, selected, as one undo step", () => {
    const { store, ids } = storeWithTwoMetools();
    expect(copySelection(store)).toBe(2);
    const count = objectsOf(store).length;
    pasteClipboard(store);
    const pasted = selectedObjectIds(store.get().selection);
    expect(pasted).toHaveLength(2);
    expect(pasted.some((id) => ids.includes(id))).toBe(false);
    const [first, second] = pasted.map((id) => objectsOf(store).find((o) => o.id === id)!);
    const grid = store.get().document.gridSize;
    const originals = ids.map((id) => objectsOf(store).find((o) => o.id === id)!);
    expect([first!.x, first!.y]).toEqual([originals[0]!.x + grid, originals[0]!.y + grid]);
    expect([second!.x, second!.y]).toEqual([originals[1]!.x + grid, originals[1]!.y + grid]);
    store.undo();
    expect(objectsOf(store)).toHaveLength(count);
  });

  it("snaps the copy's top-left to the pointer, keeping the layout", () => {
    const { store, ids } = storeWithTwoMetools();
    const [a, b] = ids.map((id) => objectsOf(store).find((o) => o.id === id)!);
    copySelection(store);
    pasteClipboard(store, { x: 197, y: 37 });
    const pasted = selectedObjectIds(store.get().selection).map((id) =>
      objectsOf(store).find((o) => o.id === id)!,
    );
    const left = Math.min(a!.x, b!.x);
    const top = Math.min(a!.y, b!.y);
    expect(pasted.map((o) => [o.x, o.y])).toEqual([
      [192 + a!.x - left, 32 + a!.y - top],
      [192 + b!.x - left, 32 + b!.y - top],
    ]);
  });

  it("keeps the paste inside the level", () => {
    const { store } = storeWithTwoMetools();
    copySelection(store);
    pasteClipboard(store, { x: 100_000, y: -500 });
    const { cols, rows, gridSize } = store.get().document;
    for (const id of selectedObjectIds(store.get().selection)) {
      const o = objectsOf(store).find((x) => x.id === id)!;
      expect(o.x).toBeGreaterThanOrEqual(0);
      expect(o.y).toBeGreaterThanOrEqual(0);
      expect(o.x).toBeLessThanOrEqual(cols * gridSize);
      expect(o.y).toBeLessThanOrEqual(rows * gridSize);
    }
    expect(
      Math.min(
        ...selectedObjectIds(store.get().selection).map(
          (id) => objectsOf(store).find((o) => o.id === id)!.y,
        ),
      ),
    ).toBe(0);
  });

  it("pastes into another level", () => {
    const { store } = storeWithTwoMetools();
    copySelection(store);
    store.open(createLevelDocument({ cols: 20 }));
    pasteClipboard(store, { x: 32, y: 32 });
    expect(objectsOf(store).filter((o) => o.definitionId === "enemy.metool")).toHaveLength(2);
    store.undo();
    expect(objectsOf(store).filter((o) => o.definitionId === "enemy.metool")).toHaveLength(0);
  });

  it("cuts as one undo step", () => {
    const { store, ids } = storeWithTwoMetools();
    cutSelection(store);
    expect(objectsOf(store).some((o) => ids.includes(o.id))).toBe(false);
    store.undo();
    expect(ids.every((id) => objectsOf(store).some((o) => o.id === id))).toBe(true);
    pasteClipboard(store);
    expect(selectedObjectIds(store.get().selection)).toHaveLength(2);
  });

  it("skips objects whose definition is unknown, with a message", () => {
    const { store, ids } = storeWithTwoMetools();
    store.execute(addObjects([{ id: "ghost", definitionId: "nope.gone", x: 0, y: 0 }]));
    store.selectObjects([...ids, "ghost"]);
    copySelection(store);
    expect(pasteClipboard(store)).toBe("1 item skipped (unknown definition).");
    const pasted = selectedObjectIds(store.get().selection);
    expect(pasted).toHaveLength(2);
    expect(objectsOf(store).filter((o) => o.definitionId === "nope.gone")).toHaveLength(1);
  });

  it("refuses to paste onto a locked or hidden layer", () => {
    const { store } = storeWithTwoMetools();
    copySelection(store);
    store.setLayerLocked("objects", true);
    const before = store.get().document;
    expect(pasteClipboard(store)).toBe("Can't paste: layer objects is locked.");
    store.setLayerLocked("objects", false);
    store.setLayerVisible("objects", false);
    expect(pasteClipboard(store)).toBe("Can't paste: layer objects is hidden.");
    expect(store.get().document).toBe(before);
  });

  it("does not copy items on a locked layer", () => {
    const { store } = storeWithTwoMetools();
    store.setLayerLocked("objects", true);
    expect(copySelection(store)).toBe(0);
  });

  it("copies and pastes decorations", () => {
    const store = new EditorStore(createLevelDocument());
    placeDecorationAt(store, "prop.life-capsule", 50, 60);
    copySelection(store);
    pasteClipboard(store);
    expect(store.get().document.decorations).toHaveLength(2);
    const [a, b] = store.get().document.decorations;
    expect(b!.id).not.toBe(a!.id);
    expect(store.get().selection).toEqual({ kind: "decorations", ids: [b!.id] });
  });

  it("adds no undo step when pasted cells change nothing", () => {
    const store = new EditorStore(createLevelDocument());
    const { cols, rows } = store.get().document;
    const floor = (rows - 1) * cols;
    store.selectTiles([floor, floor + 1]);
    copySelection(store);
    const before = store.get().document;
    pasteClipboard(store, { x: 0, y: (rows - 1) * 16 });
    expect(store.get().document).toBe(before);
    expect(store.canUndo).toBe(false);
    expect(selectedTileIndices(store.get().selection)).toEqual([floor, floor + 1]);
  });

  it("copies and pastes collision cells at the pointer as one undo step", () => {
    const store = new EditorStore(createLevelDocument());
    const { cols, rows } = store.get().document;
    const floor = (rows - 1) * cols;
    store.selectTiles([floor, floor + 1, floor + 2]);
    copySelection(store);
    pasteClipboard(store, { x: 5 * 16 + 3, y: 4 * 16 + 8 });
    const tiles = store.get().document.tiles;
    const pasted = [4 * cols + 5, 4 * cols + 6, 4 * cols + 7];
    expect(pasted.map((i) => tiles[i])).toEqual([
      TerrainTile.Solid,
      TerrainTile.Solid,
      TerrainTile.Solid,
    ]);
    expect(selectedTileIndices(store.get().selection)).toEqual(pasted);
    store.undo();
    expect(pasted.map((i) => store.get().document.tiles[i])).toEqual([
      TerrainTile.Empty,
      TerrainTile.Empty,
      TerrainTile.Empty,
    ]);
  });
});
