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
  getDefinition,
  setLevelSettings,
  setTiles,
  type DecorationInstance,
  type EditorCommand,
  type ImageLayer,
  type LevelArt,
  type LevelDocument,
  type LevelObjectInstance,
  type LevelSettings,
  type TileEdit,
  type TileLayer,
} from "@mmx/content-schema";
import { getDecorationAsset } from "@mmx/renderer-pixi";
import type { SpriteRegion } from "@mmx/project-io";
import type { AnimationAsset, ProjectAsset } from "@mmx/project-schema";
import { selectedDecorationIds, selectedObjectIds, type EditorStore } from "./EditorStore.js";
import type { ProjectSession } from "./projectSession.js";

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
  // The palette object may have been deleted while its place tool was active.
  const def = getDefinition(definitionId);
  if (!def) return;
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

/** Set the document's image layers and backdrop; absent/empty values drop their key. */
function withArt(doc: LevelDocument, art: LevelArt): LevelDocument {
  const next: LevelDocument = { ...doc, imageLayers: art.imageLayers, backdrop: art.backdrop };
  if (!next.imageLayers?.length) delete next.imageLayers;
  if (next.backdrop === undefined) delete next.backdrop;
  return next;
}

/** Replace the level art (image layers + backdrop) as one undoable command. */
export function setLevelArt(doc: LevelDocument, art: LevelArt, label: string): EditorCommand {
  const before: LevelArt = { imageLayers: doc.imageLayers, backdrop: doc.backdrop };
  return {
    label,
    execute: (d) => withArt(d, art),
    undo: (d) => withArt(d, before),
  };
}

function editImageLayers(
  store: EditorStore,
  label: string,
  edit: (layers: ImageLayer[]) => ImageLayer[],
): void {
  const doc = store.get().document;
  store.execute(
    setLevelArt(
      doc,
      { imageLayers: edit([...(doc.imageLayers ?? [])]), backdrop: doc.backdrop },
      label,
    ),
  );
}

/** Add a world-locked image layer at the world origin; returns its id. */
export function addImageLayer(store: EditorStore, assetId: string): string {
  const id = newId();
  editImageLayers(store, "Add image layer", (layers) => [
    ...layers,
    { id, assetId, x: 0, y: 0, parallax: 1, layer: "world-back" },
  ]);
  return id;
}

export function removeImageLayer(store: EditorStore, id: string): void {
  editImageLayers(store, "Remove image layer", (layers) => layers.filter((l) => l.id !== id));
}

/** Move a layer one step earlier (-1, drawn further back) or later (+1) in the list. */
export function reorderImageLayer(store: EditorStore, id: string, delta: -1 | 1): void {
  const layers = store.get().document.imageLayers ?? [];
  const from = layers.findIndex((l) => l.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= layers.length) return;
  editImageLayers(store, "Reorder image layers", (next) => {
    [next[from], next[to]] = [next[to]!, next[from]!];
    return next;
  });
}

export function updateImageLayer(
  store: EditorStore,
  id: string,
  patch: Partial<Pick<ImageLayer, "layer" | "parallax" | "x" | "y">>,
): void {
  const layer = store.get().document.imageLayers?.find((l) => l.id === id);
  if (!layer || Object.entries(patch).every(([k, v]) => layer[k as keyof ImageLayer] === v)) return;
  editImageLayers(store, "Edit image layer", (layers) =>
    layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
  );
}

/** Set (`#rrggbb`) or clear (undefined) the level backdrop colour. */
export function setBackdrop(store: EditorStore, backdrop: string | undefined): void {
  const doc = store.get().document;
  if (doc.backdrop === backdrop) return;
  store.execute(
    setLevelArt(
      doc,
      { imageLayers: doc.imageLayers, backdrop },
      backdrop ? "Set backdrop" : "Clear backdrop",
    ),
  );
}

type TileState = Pick<LevelDocument, "tileLayers" | "tiles" | "slopes">;

/** Apply tile state; an empty `tileLayers` or an undefined `slopes` drops its key. */
function withTileState(doc: LevelDocument, state: Partial<TileState>): LevelDocument {
  const next: LevelDocument = { ...doc, ...state };
  if ("tileLayers" in state && !next.tileLayers?.length) delete next.tileLayers;
  if ("slopes" in state && next.slopes === undefined) delete next.slopes;
  return next;
}

/** Replace tile layers (and, for a paint stroke, the collision under them) as one undoable command. */
export function setTileState(
  doc: LevelDocument,
  state: Partial<TileState>,
  label: string,
): EditorCommand {
  const before = Object.fromEntries(
    Object.keys(state).map((key) => [key, doc[key as keyof TileState]]),
  ) as Partial<TileState>;
  return {
    label,
    execute: (d) => withTileState(d, state),
    undo: (d) => withTileState(d, before),
  };
}

function editTileLayers(
  store: EditorStore,
  label: string,
  edit: (layers: TileLayer[]) => TileLayer[],
): void {
  const doc = store.get().document;
  store.execute(setTileState(doc, { tileLayers: edit([...(doc.tileLayers ?? [])]) }, label));
}

/** Tile layers on the world layers write collision when painted; the others are decor only. */
export function tileLayerWritesCollision(layer: Pick<TileLayer, "layer">): boolean {
  return layer.layer === "world-back" || layer.layer === "world-front";
}

/** Add an empty world tile layer painted from `tilesetId`, make it the paint target, return its id. */
export function addTileLayer(store: EditorStore, tilesetId: string): string {
  const { cols, rows } = store.get().document;
  const id = newId();
  editTileLayers(store, "Add tile layer", (layers) => [
    ...layers,
    {
      id,
      tilesetId,
      layer: "world-back",
      parallax: 1,
      cells: new Array<number>(cols * rows).fill(-1),
    },
  ]);
  store.setTilePaint({ layerId: id });
  return id;
}

export function removeTileLayer(store: EditorStore, id: string): void {
  editTileLayers(store, "Remove tile layer", (layers) => layers.filter((l) => l.id !== id));
}

/** Move a tile layer one step earlier (-1, drawn further back) or later (+1) in the list. */
export function reorderTileLayer(store: EditorStore, id: string, delta: -1 | 1): void {
  const layers = store.get().document.tileLayers ?? [];
  const from = layers.findIndex((l) => l.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= layers.length) return;
  editTileLayers(store, "Reorder tile layers", (next) => {
    [next[from], next[to]] = [next[to]!, next[from]!];
    return next;
  });
}

export function updateTileLayer(
  store: EditorStore,
  id: string,
  patch: Partial<Pick<TileLayer, "layer" | "parallax">>,
): void {
  const layer = store.get().document.tileLayers?.find((l) => l.id === id);
  if (!layer || Object.entries(patch).every(([k, v]) => layer[k as keyof TileLayer] === v)) return;
  editTileLayers(store, "Edit tile layer", (layers) =>
    layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
  );
}

/**
 * Commit a tile-layer stroke (cell index -> tile index, -1 erases) as one undoable command.
 * On a collision layer each cell also takes its tile's collision and slope profile from the
 * tileset (an erased cell becomes Empty); cells already as painted are a no-op.
 */
export function paintTileLayer(
  store: EditorStore,
  layerId: string,
  edits: ReadonlyMap<number, number>,
  label = "Paint tile layer",
): void {
  const { document: doc, tilesets } = store.get();
  const layers = doc.tileLayers ?? [];
  const layer = layers.find((l) => l.id === layerId);
  if (!layer) return;
  const tileset = tilesets[layer.tilesetId];
  const collides = tileLayerWritesCollision(layer);
  const cells = layer.cells.slice();
  const tiles = doc.tiles.slice();
  let slopes = doc.slopes;
  let changed = false;
  for (const [index, tile] of edits) {
    if (index < 0 || index >= cells.length) continue;
    if (cells[index] !== tile) {
      cells[index] = tile;
      changed = true;
    }
    if (!collides) continue;
    const kind = ((tile < 0 ? undefined : tileset?.collision[tile]) ??
      TerrainTile.Empty) as TerrainTile;
    if (tiles[index] !== kind) {
      tiles[index] = kind;
      changed = true;
    }
    const slope = kind === TerrainTile.SlopeUpRight || kind === TerrainTile.SlopeUpLeft;
    const profile = slope ? tileset?.slopes?.[tile] : undefined;
    const prev = slopes?.[index];
    if (profile ? prev?.[0] !== profile[0] || prev?.[1] !== profile[1] : prev !== undefined) {
      slopes = { ...slopes };
      if (profile) slopes[index] = [profile[0], profile[1]];
      else delete slopes[index];
      changed = true;
    }
  }
  if (!changed) return;
  const state: Partial<TileState> = {
    tileLayers: layers.map((l) => (l.id === layerId ? { ...l, cells } : l)),
  };
  if (collides) {
    state.tiles = tiles;
    state.slopes = slopes && Object.keys(slopes).length > 0 ? slopes : undefined;
  }
  store.execute(setTileState(doc, state, label));
}

/**
 * Save a sprite sheet's sliced `regions` as one undoable step. The regions live in
 * the project manifest, not the level, so the command leaves the document as is and
 * writes through the project session (which marks the project dirty).
 */
export function setSpriteRegions(
  store: EditorStore,
  session: Pick<ProjectSession, "spriteRegions" | "setSpriteRegions">,
  assetId: string,
  regions: SpriteRegion[],
): void {
  const before = session.spriteRegions(assetId);
  store.execute({
    label: "Set sprite regions",
    execute: (doc) => {
      session.setSpriteRegions(assetId, regions);
      return doc;
    },
    undo: (doc) => {
      session.setSpriteRegions(assetId, before);
      return doc;
    },
  });
}

/**
 * Replace a manifest asset (matched by `next.id`) as one undoable step: every tileset
 * edit (tile size, collision, slopes) goes through here. Like the sprite regions, the
 * asset lives in the project manifest, so the level document is left as is.
 */
export function updateAsset(
  store: EditorStore,
  session: Pick<ProjectSession, "asset" | "updateAsset">,
  next: ProjectAsset,
  label: string,
): void {
  const before = session.asset(next.id);
  if (!before || JSON.stringify(before) === JSON.stringify(next)) return;
  store.execute({
    label,
    execute: (doc) => {
      session.updateAsset(next);
      return doc;
    },
    undo: (doc) => {
      session.updateAsset(before);
      return doc;
    },
  });
}

/** Crop/pad a row-major cell grid to new dimensions, keeping each cell's (col, row); new cells are -1. */
function reshapeCells(
  cells: readonly number[],
  oldCols: number,
  oldRows: number,
  newCols: number,
  newRows: number,
): number[] {
  const out = new Array<number>(newCols * newRows).fill(-1);
  const copyCols = Math.min(oldCols, newCols);
  const copyRows = Math.min(oldRows, newRows);
  for (let r = 0; r < copyRows; r++)
    for (let c = 0; c < copyCols; c++) out[r * newCols + c] = cells[r * oldCols + c] ?? -1;
  return out;
}

/**
 * {@link setLevelSettings} that also reshapes every tile layer's cells (the content-schema
 * command reshapes only `tiles`/`slopes`), so art stays over its collision after a resize.
 */
export function setRoomSettings(doc: LevelDocument, next: LevelSettings): EditorCommand {
  const inner = setLevelSettings(doc, next);
  const before = doc.tileLayers;
  const after =
    before && (next.cols !== doc.cols || next.rows !== doc.rows)
      ? before.map((l) => ({
          ...l,
          cells: reshapeCells(l.cells, doc.cols, doc.rows, next.cols, next.rows),
        }))
      : before;
  const withLayers = (d: LevelDocument, tileLayers: TileLayer[] | undefined): LevelDocument =>
    tileLayers ? { ...d, tileLayers } : d;
  return {
    label: inner.label,
    execute: (d) => withLayers(inner.execute(d), after),
    undo: (d) => withLayers(inner.undo(d), before),
  };
}

/**
 * Replace (or with null remove) an `animation` asset as one undoable step: every
 * clip edit (contract C-CLIP) goes through here. Like the sprite regions, the asset
 * lives in the project manifest, so the level document is left as is.
 */
export function setAnimationAsset(
  store: EditorStore,
  session: Pick<ProjectSession, "animationAsset" | "setAnimationAsset">,
  assetId: string,
  next: AnimationAsset | null,
  label: string,
): void {
  const before = session.animationAsset(assetId);
  store.execute({
    label,
    execute: (doc) => {
      session.setAnimationAsset(assetId, next);
      return doc;
    },
    undo: (doc) => {
      session.setAnimationAsset(assetId, before);
      return doc;
    },
  });
}

/** Bind the player's animation (`game/data.json` bindings.playerAnimation) as one undoable step. */
export function setPlayerAnimation(
  store: EditorStore,
  session: Pick<ProjectSession, "playerAnimation" | "setPlayerAnimation">,
  assetId: string,
): void {
  const before = session.playerAnimation();
  if (before === assetId) return;
  store.execute({
    label: "Use as player animation",
    execute: (doc) => {
      session.setPlayerAnimation(assetId);
      return doc;
    },
    undo: (doc) => {
      if (before) session.setPlayerAnimation(before);
      return doc;
    },
  });
}
