import { beforeAll, describe, expect, it, vi } from "vitest";
import { createLevelDocument, TerrainTile } from "@mmx/content-schema";
import {
  EditorStore,
  isLayerEditable,
  isLayerLocked,
  isLayerVisible,
  objectLayerKey,
  paintTargetKey,
  selectedObjectIds,
  selectedTileIndices,
} from "./EditorStore.js";
import {
  addImageLayer,
  addTileLayer,
  placeAt,
  reorderTarget,
  reorderTileLayer,
  setTileAt,
  updateImageLayer,
  updateTileLayer,
} from "./actions.js";
import { EditorViewportInteraction } from "./EditorViewportInteraction.js";
import { layerStack } from "./layers.js";

const tileset = {
  id: "tileset.ground",
  kind: "tileset" as const,
  path: "assets/sprites/ground.png",
  tileSize: 16,
  collision: { 0: TerrainTile.Solid },
};

describe("layer visibility and locks", () => {
  it("default every key to shown and unlocked, and toggle one key at a time", () => {
    const store = new EditorStore(createLevelDocument());
    const keys = ["objects", "cameras", "collision", "tile:a", "image:b", "foreground"] as const;
    for (const key of keys) {
      expect([isLayerVisible(store.get(), key), isLayerLocked(store.get(), key)]).toEqual([
        true,
        false,
      ]);
    }
    store.setLayerVisible("tile:a", false);
    store.setLayerLocked("collision", true);
    expect(isLayerVisible(store.get(), "tile:a")).toBe(false);
    expect(isLayerVisible(store.get(), "tile:b")).toBe(true);
    expect(isLayerEditable(store.get(), "collision")).toBe(false);
    expect(isLayerEditable(store.get(), "objects")).toBe(true);
    // Editor state only: the document is untouched and nothing enters the history.
    expect(store.canUndo).toBe(false);
    store.open(createLevelDocument());
    expect([store.get().layerVisible, store.get().layerLocked]).toEqual([{}, {}]);
  });

  it("keys cameras apart from other objects, and the paint tool to its target", () => {
    expect(objectLayerKey({ definitionId: "camera-zone" })).toBe("cameras");
    expect(objectLayerKey({ definitionId: "spawn" })).toBe("objects");
    const tilePaint = { layerId: "a", tile: 0, mode: "brush" as const };
    expect(paintTargetKey({ activeTool: "tile", tilePaint })).toBe("collision");
    expect(paintTargetKey({ activeTool: "tilePaint", tilePaint })).toBe("tile:a");
    expect(paintTargetKey({ activeTool: "select", tilePaint })).toBeUndefined();
  });

  it("leaves a locked collision layer alone from the context menu", () => {
    const store = new EditorStore(createLevelDocument());
    store.setLayerLocked("collision", true);
    setTileAt(store, 3, 3, true);
    expect(store.canUndo).toBe(false);
  });
});

describe("layer stack", () => {
  it("lists every layer front first, in the viewport's draw order", () => {
    const store = new EditorStore(createLevelDocument());
    store.setTilesets({ [tileset.id]: tileset });
    const back = addTileLayer(store, tileset.id);
    const front = addTileLayer(store, tileset.id);
    updateTileLayer(store, front, { layer: "foreground" });
    const img = addImageLayer(store, "image.bg");
    updateImageLayer(store, img, { layer: "background" });
    const sky = addImageLayer(store, "image.sky");
    updateImageLayer(store, sky, { layer: "background" });
    expect(layerStack(store.get().document).map((r) => r.key)).toEqual([
      `tile:${front}`,
      "foreground",
      "world-front",
      "objects",
      "cameras",
      "world-back",
      "background",
      "far-background",
      "collision",
      `tile:${back}`,
      `image:${sky}`,
      `image:${img}`,
    ]);
  });

  it("moves a layer past the ones on other draw layers", () => {
    const store = new EditorStore(createLevelDocument());
    store.setTilesets({ [tileset.id]: tileset });
    const a = addTileLayer(store, tileset.id);
    const b = addTileLayer(store, tileset.id);
    const c = addTileLayer(store, tileset.id);
    updateTileLayer(store, b, { layer: "foreground" });
    const layers = store.get().document.tileLayers!;
    expect(reorderTarget(layers, a, 1)).toBe(2);
    expect(reorderTarget(layers, b, 1)).toBe(-1);
    expect(reorderTarget(layers, b, -1)).toBe(-1);
    reorderTileLayer(store, c, -1);
    expect(store.get().document.tileLayers!.map((l) => l.id)).toEqual([c, b, a]);
  });
});

describe("viewport interaction on locked layers", () => {
  beforeAll(() => {
    vi.stubGlobal("window", new EventTarget());
  });

  /** A viewport over a fake canvas at the origin; the store's zoom 2 maps world (x, y) to (2x, 2y). */
  function viewport(store: EditorStore) {
    const canvas = Object.assign(new EventTarget(), {
      getBoundingClientRect: () => ({ left: 0, top: 0 }),
      setPointerCapture: () => undefined,
    }) as unknown as HTMLCanvasElement;
    new EditorViewportInteraction(canvas, store, () => undefined);
    const fire = (target: EventTarget, type: string, x: number, y: number) =>
      target.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x * 2,
          clientY: y * 2,
          button: 0,
          pointerId: 1,
          shiftKey: false,
          altKey: false,
        }),
      );
    return {
      click(x: number, y: number) {
        fire(canvas, "pointerdown", x, y);
        fire(window, "pointerup", x, y);
      },
      drag(from: [number, number], to: [number, number]) {
        fire(canvas, "pointerdown", ...from);
        fire(canvas, "pointermove", ...to);
        fire(window, "pointerup", ...to);
      },
    };
  }

  it("selects no locked objects or cameras, by click or marquee", () => {
    const store = new EditorStore(createLevelDocument());
    const spawn = store.get().document.objects[0]!;
    placeAt(store, "camera-zone", 400, 0);
    const camera = store.get().document.objects.at(-1)!;
    store.clearSelection();
    const view = viewport(store);
    const center = (o: typeof spawn) => [o.x + 2, o.y + 2] as const;

    store.setLayerLocked("objects", true);
    view.click(...center(spawn));
    expect(selectedObjectIds(store.get().selection)).toEqual([]);
    view.drag([0, 0], [700, 360]);
    expect(selectedObjectIds(store.get().selection)).toEqual([camera.id]);

    store.setLayerLocked("objects", false);
    store.setLayerVisible("cameras", false);
    view.click(...center(camera));
    expect(selectedObjectIds(store.get().selection)).toEqual([]);
    view.click(...center(spawn));
    expect(selectedObjectIds(store.get().selection)).toEqual([spawn.id]);
  });

  it("neither selects nor paints a locked collision layer", () => {
    const store = new EditorStore(createLevelDocument());
    const { rows } = store.get().document;
    const floorY = (rows - 1) * 16 + 8;
    const view = viewport(store);
    store.setLayerLocked("collision", true);
    view.click(40, floorY);
    expect(selectedTileIndices(store.get().selection)).toEqual([]);
    store.setTool("tile");
    view.click(40, 40);
    expect(store.canUndo).toBe(false);

    store.setLayerLocked("collision", false);
    view.click(40, 40);
    expect(store.canUndo).toBe(true);
  });

  it("paints no locked or hidden tile layer", () => {
    const store = new EditorStore(createLevelDocument());
    store.setTilesets({ [tileset.id]: tileset });
    const id = addTileLayer(store, tileset.id);
    const cells = () => store.get().document.tileLayers![0]!.cells.filter((c) => c >= 0).length;
    const view = viewport(store);
    store.setTool("tilePaint");
    store.setLayerLocked(`tile:${id}`, true);
    view.click(40, 40);
    store.setLayerLocked(`tile:${id}`, false);
    store.setLayerVisible(`tile:${id}`, false);
    view.click(40, 40);
    expect(cells()).toBe(0);
    store.setLayerVisible(`tile:${id}`, true);
    view.click(40, 40);
    expect(cells()).toBe(1);
  });
});
