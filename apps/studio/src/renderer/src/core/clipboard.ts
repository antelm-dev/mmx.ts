import {
  TerrainTile,
  addDecorations,
  addObjects,
  getDefinition,
  instanceSize,
  newId,
  type DecorationInstance,
  type LevelObjectInstance,
} from "@mmx/content-schema";
import { decorationBounds, getDecorationAsset } from "@mmx/renderer-pixi";
import {
  isLayerEditable,
  isLayerVisible,
  objectLayerKey,
  type EditorStore,
  type LayerKey,
} from "./EditorStore.js";
import { deleteSelection, editableSelectionIds, setTileState } from "./actions.js";

/** World pixels for objects and decorations, grid cells for terrain. */
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A copied collision cell, at its level column and row. */
interface ClipCell {
  col: number;
  row: number;
  value: TerrainTile;
  slope?: [number, number];
}

type Clip =
  | { kind: "objects"; items: LevelObjectInstance[]; box: Box }
  | { kind: "decorations"; items: DecorationInstance[]; box: Box }
  | { kind: "tiles"; cells: ClipCell[]; box: Box };

// Studio-internal and in memory: it outlives level and project switches, never touches the OS.
let clip: Clip | null = null;

/** Empty the clipboard (tests). */
export function clearClipboard(): void {
  clip = null;
}

function union(boxes: readonly Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: right - x, h: bottom - y };
}

/** Copy the selection on shown, unlocked layers; returns how many items were copied. */
export function copySelection(store: EditorStore): number {
  const state = store.get();
  const { document: doc, selection } = state;
  if (selection.kind === "tiles") {
    if (selection.indices.length === 0 || !isLayerEditable(state, "collision")) return 0;
    const cells = selection.indices.map((i) => ({
      col: i % doc.cols,
      row: Math.floor(i / doc.cols),
      value: doc.tiles[i] ?? TerrainTile.Empty,
      slope: doc.slopes?.[i],
    }));
    const box = union(cells.map((c) => ({ x: c.col, y: c.row, w: 1, h: 1 })));
    clip = { kind: "tiles", cells: structuredClone(cells), box };
    return cells.length;
  }
  const ids = new Set(editableSelectionIds(store));
  if (ids.size === 0) return 0;
  if (selection.kind === "decorations") {
    const items = doc.decorations.filter((d) => ids.has(d.id));
    const boxes = items.map((d) => decorationBounds(d) ?? { x: d.x, y: d.y, w: 0, h: 0 });
    clip = { kind: "decorations", items: structuredClone(items), box: union(boxes) };
    return items.length;
  }
  const items = doc.objects.filter((o) => ids.has(o.id));
  const boxes = items.map((o) => {
    const { width, height } = instanceSize(o);
    return { x: o.x, y: o.y, w: width, h: height };
  });
  clip = { kind: "objects", items: structuredClone(items), box: union(boxes) };
  return items.length;
}

/** Copy then delete the selection; the delete is the only undo step. */
export function cutSelection(store: EditorStore): void {
  if (copySelection(store) > 0) deleteSelection(store);
}

/** Top-left of the paste on one axis: at `at` (or one `step` past the original), kept inside `[0, limit]`. */
function placeAxis(
  from: number,
  size: number,
  limit: number,
  at: number | undefined,
  step: number,
) {
  return Math.max(0, Math.min(at ?? from + step, limit - size));
}

function skippedMessage(count: number, why: string): string | undefined {
  if (count === 0) return undefined;
  return `${count} ${count === 1 ? "item" : "items"} skipped (${why}).`;
}

function refusal(state: ReturnType<EditorStore["get"]>, keys: Iterable<LayerKey>): string | null {
  for (const key of keys) {
    if (!isLayerEditable(state, key))
      return `Can't paste: layer ${key} is ${isLayerVisible(state, key) ? "locked" : "hidden"}.`;
  }
  return null;
}

/**
 * Paste the clipboard as one undo step and select it. Its top-left lands on `pointer` (world
 * pixels) snapped like a placement (terrain: the cell under it), else one cell down-right of
 * the original; either way inside the level.
 * Returns a message for the user (a refusal, or items whose definition or asset is missing).
 */
export function pasteClipboard(
  store: EditorStore,
  pointer?: { x: number; y: number },
): string | undefined {
  if (!clip) return undefined;
  const state = store.get();
  const doc = state.document;
  const grid = doc.gridSize;

  if (clip.kind === "tiles") {
    const locked = refusal(state, ["collision"]);
    if (locked) return locked;
    const { box } = clip;
    const col = placeAxis(box.x, box.w, doc.cols, pointer && Math.floor(pointer.x / grid), 1);
    const row = placeAxis(box.y, box.h, doc.rows, pointer && Math.floor(pointer.y / grid), 1);
    const tiles = doc.tiles.slice();
    const slopes = { ...doc.slopes };
    const indices: number[] = [];
    let changed = false;
    for (const c of clip.cells) {
      const cc = c.col - box.x + col;
      const rr = c.row - box.y + row;
      // A copy wider than this level loses the cells past its edge.
      if (cc >= doc.cols || rr >= doc.rows) continue;
      const index = rr * doc.cols + cc;
      const prev = doc.slopes?.[index];
      changed ||=
        tiles[index] !== c.value || prev?.[0] !== c.slope?.[0] || prev?.[1] !== c.slope?.[1];
      tiles[index] = c.value;
      if (c.slope) slopes[index] = [c.slope[0], c.slope[1]];
      else delete slopes[index];
      indices.push(index);
    }
    // Pasting cells over identical ones must not add a history entry or dirty the level.
    if (changed)
      store.execute(
        setTileState(
          doc,
          { tiles, slopes: Object.keys(slopes).length > 0 ? slopes : undefined },
          "Paste tiles",
        ),
      );
    store.selectTiles(indices);
    return undefined;
  }

  const { box } = clip;
  const dx =
    placeAxis(box.x, box.w, doc.cols * grid, pointer && store.snap(pointer.x), grid) - box.x;
  const dy =
    placeAxis(box.y, box.h, doc.rows * grid, pointer && store.snap(pointer.y), grid) - box.y;

  if (clip.kind === "decorations") {
    const kept = clip.items.filter((d) => getDecorationAsset(d.assetId));
    const skipped = clip.items.length - kept.length;
    const locked = refusal(state, new Set(kept.map((d) => d.layer)));
    if (locked) return locked;
    const copies = structuredClone(kept).map((d) => ({
      ...d,
      id: newId(),
      x: d.x + dx,
      y: d.y + dy,
    }));
    if (copies.length > 0) {
      store.execute(addDecorations(copies, "Paste decorations"));
      store.selectDecorations(copies.map((c) => c.id));
    }
    return skippedMessage(skipped, "missing asset");
  }

  const kept = clip.items.filter((o) => getDefinition(o.definitionId));
  const skipped = clip.items.length - kept.length;
  const locked = refusal(state, new Set(kept.map(objectLayerKey)));
  if (locked) return locked;
  const copies = structuredClone(kept).map((o) => ({
    ...o,
    id: newId(),
    x: o.x + dx,
    y: o.y + dy,
  }));
  if (copies.length > 0) {
    store.execute(addObjects(copies, "Paste"));
    store.selectObjects(copies.map((c) => c.id));
  }
  return skippedMessage(skipped, "unknown definition");
}
