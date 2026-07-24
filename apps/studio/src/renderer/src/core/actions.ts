import {
  addObjects,
  deleteObjects,
  moveObjects,
  newId,
  requireDefinition,
  type LevelObjectInstance,
} from "@mmx/content-schema";
import type { EditorStore } from "./EditorStore.js";

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
  store.select([inst.id]);
}

/** Duplicate the current selection one grid cell down-right, and select the copies. */
export function duplicateSelection(store: EditorStore): void {
  const { document, selectedIds } = store.get();
  if (selectedIds.length === 0) return;
  const grid = document.gridSize;
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
  store.select(copies.map((c) => c.id));
}

/** Delete the current selection. */
export function deleteSelection(store: EditorStore): void {
  const { document, selectedIds } = store.get();
  if (selectedIds.length === 0) return;
  store.execute(deleteObjects(document, selectedIds));
  store.clearSelection();
}

/** Nudge the selection by a pixel delta (arrow keys). */
export function nudgeSelection(store: EditorStore, dx: number, dy: number): void {
  const { selectedIds } = store.get();
  if (selectedIds.length === 0) return;
  store.execute(moveObjects(selectedIds, dx, dy));
}
