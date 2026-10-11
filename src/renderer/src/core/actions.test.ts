import { describe, expect, it } from "vitest";
import { createLevelDocument, TerrainTile } from "@mmx/content-schema";
import type { AnimationAsset } from "@mmx/project-schema";
import {
  EditorStore,
  selectedDecorationIds,
  selectedObjectIds,
  selectedTileIndices,
} from "./EditorStore.js";
import {
  addImageLayer,
  cellIndex,
  deleteSelection,
  duplicateSelection,
  nudgeSelection,
  paintTiles,
  placeAt,
  placeDecorationAt,
  removeImageLayer,
  reorderImageLayer,
  setAnimationAsset,
  setBackdrop,
  setPlayerAnimation,
  setSpriteRegions,
  setTileAt,
  updateImageLayer,
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

describe("image layer actions", () => {
  const ids = (store: EditorStore) => (store.get().document.imageLayers ?? []).map((l) => l.id);

  it("adds a world-locked layer and undo removes the key entirely", () => {
    const store = freshStore();
    const id = addImageLayer(store, "image.stage");
    expect(store.get().document.imageLayers).toEqual([
      { id, assetId: "image.stage", x: 0, y: 0, parallax: 1, layer: "world-back" },
    ]);
    expect(store.isDirty).toBe(true);
    store.undo();
    expect("imageLayers" in store.get().document).toBe(false);
    store.redo();
    expect(ids(store)).toEqual([id]);
  });

  it("reorders, edits and removes layers, each as one undo step", () => {
    const store = freshStore();
    const a = addImageLayer(store, "image.a");
    const b = addImageLayer(store, "image.b");

    reorderImageLayer(store, b, -1);
    expect(ids(store)).toEqual([b, a]);
    reorderImageLayer(store, b, -1); // already first: no-op, no history entry
    store.undo();
    expect(ids(store)).toEqual([a, b]);

    updateImageLayer(store, a, { layer: "background", parallax: 0.5, x: 8, y: -4 });
    expect(store.get().document.imageLayers![0]).toMatchObject({
      layer: "background",
      parallax: 0.5,
      x: 8,
      y: -4,
    });
    store.undo();
    expect(store.get().document.imageLayers![0]).toMatchObject({ layer: "world-back", parallax: 1 });

    removeImageLayer(store, a);
    expect(ids(store)).toEqual([b]);
    store.undo();
    expect(ids(store)).toEqual([a, b]);
  });

  it("sets and clears the backdrop with undo", () => {
    const store = freshStore();
    setBackdrop(store, "#3a1c5c");
    expect(store.get().document.backdrop).toBe("#3a1c5c");
    setBackdrop(store, undefined);
    expect("backdrop" in store.get().document).toBe(false);
    store.undo();
    expect(store.get().document.backdrop).toBe("#3a1c5c");
    store.undo();
    expect("backdrop" in store.get().document).toBe(false);
  });

  it("reports image layers whose asset is not a project image", () => {
    const store = freshStore();
    addImageLayer(store, "sprite.bg");
    const codes = store.validate(["image.stage"]).issues.map((i) => i.code);
    expect(codes).toContain("imageLayer.asset.unknown");
    expect(store.validate(["sprite.bg"]).issues.map((i) => i.code)).not.toContain(
      "imageLayer.asset.unknown",
    );
  });
});

describe("setSpriteRegions", () => {
  it("writes the regions through the session and undoes/redoes them", () => {
    const store = freshStore();
    const saved: Record<string, { id: string; region: [number, number, number, number] }[]> = {
      "sprite.sheet": [{ id: "frame.0", region: [0, 0, 8, 8] }],
    };
    const session = {
      spriteRegions: (id: string) => saved[id] ?? [],
      setSpriteRegions: (id: string, regions: (typeof saved)[string]) => void (saved[id] = regions),
    };
    const next = [
      { id: "frame.0", region: [0, 0, 32, 32] as [number, number, number, number] },
      { id: "frame.1", region: [32, 0, 32, 32] as [number, number, number, number] },
    ];
    setSpriteRegions(store, session, "sprite.sheet", next);
    expect(saved["sprite.sheet"]).toEqual(next);
    expect(store.undoLabel).toBe("Set sprite regions");
    store.undo();
    expect(saved["sprite.sheet"]).toEqual([{ id: "frame.0", region: [0, 0, 8, 8] }]);
    store.redo();
    expect(saved["sprite.sheet"]).toEqual(next);
  });
});

describe("clip commands", () => {
  const frame = (x: number) => ({ region: [x, 0, 32, 32] as const, duration: 4 });
  const fakeSession = (initial: AnimationAsset[]) => {
    const assets = new Map(initial.map((asset) => [asset.id, asset]));
    let player: string | null = "anim.old";
    return {
      assets,
      animationAsset: (id: string) => assets.get(id) ?? null,
      setAnimationAsset: (id: string, next: AnimationAsset | null) => void (next ? assets.set(id, next) : assets.delete(id)),
      playerAnimation: () => player,
      setPlayerAnimation: (id: string) => void (player = id),
    };
  };
  const asset = (animations: AnimationAsset["animations"]): AnimationAsset => ({
    id: "anim.sheet",
    kind: "animation",
    path: "assets/sheet.png",
    sheetAssetId: "sprite.sheet",
    animations,
  });

  it("creates a clip (and its asset), edits frames, and undoes/redoes each step", () => {
    const store = freshStore();
    const session = fakeSession([]);
    const idle = { loop: true, speed: 60, frames: [frame(0)] };
    setAnimationAsset(store, session, "anim.sheet", asset({ idle }), "Create clip");
    expect(session.assets.get("anim.sheet")?.animations.idle).toEqual(idle);

    const walk = { loop: true, speed: 60, frames: [frame(0), frame(32), frame(64), frame(96)] };
    setAnimationAsset(store, session, "anim.sheet", asset({ idle, walk }), "Create clip");
    // Reorder, durations, loop start and anchor are each one replacement of the asset.
    const edited = { ...walk, loopStart: 1, frames: [walk.frames[1]!, walk.frames[0]!, ...walk.frames.slice(2)].map((f) => ({ ...f, duration: 6, anchor: [16, 32] as const })) };
    setAnimationAsset(store, session, "anim.sheet", asset({ idle, walk: edited }), "Set frame duration");
    expect(store.undoLabel).toBe("Set frame duration");

    store.undo();
    expect(session.assets.get("anim.sheet")?.animations.walk).toEqual(walk);
    store.undo();
    expect(Object.keys(session.assets.get("anim.sheet")!.animations)).toEqual(["idle"]);
    store.undo();
    expect(session.assets.has("anim.sheet")).toBe(false);
    store.redo();
    store.redo();
    store.redo();
    expect(session.assets.get("anim.sheet")?.animations.walk).toEqual(edited);
    // The untouched clip keeps its frames as they were: no anchor added.
    expect(session.assets.get("anim.sheet")?.animations.idle.frames[0]).not.toHaveProperty("anchor");
  });

  it("binds the player animation and restores the previous binding on undo", () => {
    const store = freshStore();
    const session = fakeSession([]);
    setPlayerAnimation(store, session, "anim.sheet");
    expect(session.playerAnimation()).toBe("anim.sheet");
    store.undo();
    expect(session.playerAnimation()).toBe("anim.old");
    store.redo();
    expect(session.playerAnimation()).toBe("anim.sheet");
  });
});
