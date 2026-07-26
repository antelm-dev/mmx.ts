import {
  TerrainTile,
  addDecorations,
  addObjects,
  deleteDecorations,
  deleteObjects,
  moveDecorations,
  moveObjects,
  moveTiles,
  newId,
  requireDefinition,
  setTiles,
  type DecorationInstance,
  type LevelObjectInstance,
  type TileEdit,
} from "@mmx/content-schema";
import { getDecorationAsset } from "@mmx/renderer-pixi";
import {
  selectedDecorationIds,
  selectedObjectIds,
  type EditorStore,
} from "./EditorStore.js";

/**
 * Intent → undoable command. Everything the toolbar, palette, viewport and
 * keyboard shortcuts do to the document funnels through here, so there is one
 * place that decides how a placement is sized or a duplicate is offset.
 */

/** Place a new instance of a definition, centring point objects on the cursor. */
export function placeAt(
  store: EditorStore,
  definitionId: string,
  worldX: number,
  worldY: number,
): void {
  const def = requireDefinition(definitionId);
  const { width, height } = def.defaultSize;
  const resizable = def.editor.resizable === true;
  const point = def.editor.placement === "point";
  const x = store.snap(point ? worldX - width / 2 : worldX);
  const y = store.snap(point ? worldY - height / 2 : worldY);

  const inst: LevelObjectInstance = { id: newId(), definitionId, x, y };
  if (resizable) {
    inst.width = width;
    inst.height = height;
  }
  store.execute(addObjects([inst], `Add ${def.name}`));
  store.selectObjects([inst.id]);
}

/** Place a decoration sprite at the cursor (anchor point). */
export function placeDecorationAt(
  store: EditorStore,
  assetId: string,
  worldX: number,
  worldY: number,
): void {
  const asset = getDecorationAsset(assetId);
  if (!asset) return;
  const inst: DecorationInstance = {
    id: newId(),
    assetId,
    x: store.snap(worldX),
    y: store.snap(worldY),
    layer: asset.defaultLayer,
  };
  if (asset.defaultParallax !== undefined) inst.parallax = asset.defaultParallax;
  store.execute(addDecorations([inst], `Add ${asset.name}`));
  store.selectDecorations([inst.id]);
}

/** Duplicate the current object or decoration selection one grid cell down-right. */
export function duplicateSelection(store: EditorStore): void {
  const { document, selection } = store.get();
  const grid = document.gridSize;

  if (selection.kind === "decorations") {
    const selectedIds = selectedDecorationIds(selection);
    if (selectedIds.length === 0) return;
    const selected = new Set(selectedIds);
    const copies = document.decorations
      .filter((d) => selected.has(d.id))
      .map((d) => ({ ...d, id: newId(), x: d.x + grid, y: d.y + grid }));
    if (copies.length === 0) return;
    store.execute(addDecorations(copies, "Duplicate decoration"));
    store.selectDecorations(copies.map((c) => c.id));
    return;
  }

  const selectedIds = selectedObjectIds(selection);
  if (selectedIds.length === 0) return;
  const selected = new Set(selectedIds);
  const copies = document.objects
    .filter((o) => selected.has(o.id))
    .map((o) => ({
      ...o,
      id: newId(),
      x: o.x + grid,
      y: o.y + grid,
      overrides: o.overrides ? { ...o.overrides } : undefined,
    }));
  if (copies.length === 0) return;
  store.execute(addObjects(copies, "Duplicate"));
  store.selectObjects(copies.map((c) => c.id));
}

/** Delete the current selection (objects, decorations, or terrain cells). */
export function deleteSelection(store: EditorStore): void {
  const { document, selection } = store.get();
  if (selection.kind === "tiles") {
    if (selection.indices.length === 0) return;
    const edits = selection.indices.map((index) => ({ index, value: TerrainTile.Empty }));
    paintTiles(store, edits, true);
    store.clearSelection();
    return;
  }
  if (selection.kind === "decorations") {
    if (selection.ids.length === 0) return;
    store.execute(deleteDecorations(document, selection.ids));
    store.clearSelection();
    return;
  }
  if (selection.ids.length === 0) return;
  store.execute(deleteObjects(document, selection.ids));
  store.clearSelection();
}

/** Row-major tile index for a grid cell, or null when the cell is out of bounds. */
export function cellIndex(store: EditorStore, col: number, row: number): number | null {
  const { cols, rows } = store.get().document;
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  return row * cols + col;
}

/**
 * Commit a terrain stroke as one undoable command. Cells already at their target
 * value are dropped here (not just inside {@link setTiles}) so an all-no-op stroke
 * never reaches the history — e.g. dragging the paint tool over existing solid.
 */
export function paintTiles(store: EditorStore, edits: readonly TileEdit[], erasing: boolean): void {
  const tiles = store.get().document.tiles;
  const changed = edits.filter((e) => (tiles[e.index] ?? TerrainTile.Empty) !== e.value);
  if (changed.length === 0) return;
  store.execute(setTiles(store.get().document, changed, erasing ? "Erase tiles" : "Paint tiles"));
}

/** Set a single terrain cell to solid or empty (context-menu "Add/Remove tile"). */
export function setTileAt(store: EditorStore, col: number, row: number, solid: boolean): void {
  const index = cellIndex(store, col, row);
  if (index === null) return;
  paintTiles(store, [{ index, value: solid ? TerrainTile.Solid : TerrainTile.Empty }], !solid);
}

/** Move selected terrain cells by a grid offset; updates the selection to the destinations. */
export function moveSelectedTiles(store: EditorStore, dCol: number, dRow: number): void {
  const { document, selection } = store.get();
  if (selection.kind !== "tiles" || selection.indices.length === 0) return;
  const result = moveTiles(document, selection.indices, dCol, dRow);
  if (!result) return;
  store.execute(result.command);
  store.selectTiles(result.nextIndices);
}

/** Nudge the selection (objects/decorations by pixels, tiles by cells). */
export function nudgeSelection(store: EditorStore, dx: number, dy: number): void {
  const { document, selection } = store.get();
  if (selection.kind === "tiles") {
    const g = document.gridSize;
    const dCol = dx === 0 ? 0 : Math.trunc(dx / g) || Math.sign(dx);
    const dRow = dy === 0 ? 0 : Math.trunc(dy / g) || Math.sign(dy);
    moveSelectedTiles(store, dCol, dRow);
    return;
  }
  if (selection.kind === "decorations") {
    const ids = selectedDecorationIds(selection);
    if (ids.length === 0) return;
    store.execute(moveDecorations(ids, dx, dy));
    return;
  }
  const selectedIds = selectedObjectIds(selection);
  if (selectedIds.length === 0) return;
  store.execute(moveObjects(selectedIds, dx, dy));
}
