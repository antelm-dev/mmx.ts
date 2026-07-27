import { TerrainTile } from "@mmx/contracts/terrain";
import type { DecorationInstance, LevelDocument, LevelObjectInstance } from "./types.js";

/**
 * A command-based, fully reversible mutation log.
 *
 * Every document change goes through one {@link EditorCommand} so that undo/redo
 * is uniform and a grouped gesture (a drag that fired a hundred pointer events)
 * collapses to a single history entry — the command carries the net delta, not
 * the path. Commands are pure functions of the document, which is what lets them
 * be unit-tested headlessly and keeps the editor's saved document the single
 * source of truth (temporary UI state lives elsewhere; see the editor app).
 */
export interface EditorCommand {
  label: string;
  execute(document: LevelDocument): LevelDocument;
  undo(document: LevelDocument): LevelDocument;
}

type TransformKey = "x" | "y" | "width" | "height" | "rotation";
export type Transform = Partial<Record<TransformKey, number>>;

export type DecorationPatch = Partial<
  Pick<
    DecorationInstance,
    | "x"
    | "y"
    | "layer"
    | "flipX"
    | "flipY"
    | "rotation"
    | "parallax"
    | "animation"
    | "tint"
    | "assetId"
  >
>;

function mapObjects(
  doc: LevelDocument,
  fn: (o: LevelObjectInstance) => LevelObjectInstance,
): LevelDocument {
  return { ...doc, objects: doc.objects.map(fn) };
}

function mapDecorations(
  doc: LevelDocument,
  fn: (d: DecorationInstance) => DecorationInstance,
): LevelDocument {
  return { ...doc, decorations: doc.decorations.map(fn) };
}

function withOverride(o: LevelObjectInstance, key: string, value: unknown): LevelObjectInstance {
  const overrides = { ...o.overrides };
  if (value === undefined) delete overrides[key];
  else overrides[key] = value;
  const next: LevelObjectInstance = { ...o };
  if (Object.keys(overrides).length > 0) next.overrides = overrides;
  else delete next.overrides;
  return next;
}

/** Move a set of objects by a net delta. One entry per drag, not per pointer move. */
export function moveObjects(ids: readonly string[], dx: number, dy: number): EditorCommand {
  const set = new Set(ids);
  const shift =
    (sx: number, sy: number) =>
    (doc: LevelDocument): LevelDocument =>
      mapObjects(doc, (o) => (set.has(o.id) ? { ...o, x: o.x + sx, y: o.y + sy } : o));
  return { label: "Move", execute: shift(dx, dy), undo: shift(-dx, -dy) };
}

/** Move decorations by a net delta. */
export function moveDecorations(ids: readonly string[], dx: number, dy: number): EditorCommand {
  const set = new Set(ids);
  const shift =
    (sx: number, sy: number) =>
    (doc: LevelDocument): LevelDocument =>
      mapDecorations(doc, (d) => (set.has(d.id) ? { ...d, x: d.x + sx, y: d.y + sy } : d));
  return { label: "Move decorations", execute: shift(dx, dy), undo: shift(-dx, -dy) };
}

/** Apply a transform patch (resize/move/rotate) to one object, reversibly. */
export function setTransform(id: string, before: Transform, after: Transform): EditorCommand {
  const apply =
    (patch: Transform) =>
    (doc: LevelDocument): LevelDocument =>
      mapObjects(doc, (o) => (o.id === id ? { ...o, ...patch } : o));
  return { label: "Resize", execute: apply(after), undo: apply(before) };
}

/** Patch one decoration's authored fields, reversibly. */
export function setDecoration(
  id: string,
  before: DecorationPatch,
  after: DecorationPatch,
): EditorCommand {
  const apply =
    (patch: DecorationPatch) =>
    (doc: LevelDocument): LevelDocument =>
      mapDecorations(doc, (d) => {
        if (d.id !== id) return d;
        const next: DecorationInstance = { ...d };
        for (const [key, value] of Object.entries(patch) as [keyof DecorationPatch, unknown][]) {
          if (value === undefined) delete next[key];
          else (next as unknown as Record<string, unknown>)[key] = value;
        }
        return next;
      });
  return { label: "Edit decoration", execute: apply(after), undo: apply(before) };
}

/** Set one editable property (transform or override) on one object. */
export function setProperty(
  id: string,
  key: string,
  scope: "transform" | "override",
  before: unknown,
  after: unknown,
): EditorCommand {
  const apply =
    (value: unknown) =>
    (doc: LevelDocument): LevelDocument =>
      mapObjects(doc, (o) => {
        if (o.id !== id) return o;
        if (scope === "transform") {
          const next: LevelObjectInstance = { ...o };
          (next as unknown as Record<string, unknown>)[key] = value;
          return next;
        }
        return withOverride(o, key, value);
      });
  return { label: `Set ${key}`, execute: apply(after), undo: apply(before) };
}

/** Add one or more freshly built instances (also used for paste/duplicate). */
export function addObjects(
  instances: readonly LevelObjectInstance[],
  label = "Add",
): EditorCommand {
  const ids = new Set(instances.map((i) => i.id));
  return {
    label,
    execute: (doc) => ({ ...doc, objects: [...doc.objects, ...instances] }),
    undo: (doc) => ({ ...doc, objects: doc.objects.filter((o) => !ids.has(o.id)) }),
  };
}

/** Add one or more decoration instances. */
export function addDecorations(
  instances: readonly DecorationInstance[],
  label = "Add decoration",
): EditorCommand {
  const ids = new Set(instances.map((i) => i.id));
  return {
    label,
    execute: (doc) => ({ ...doc, decorations: [...doc.decorations, ...instances] }),
    undo: (doc) => ({ ...doc, decorations: doc.decorations.filter((d) => !ids.has(d.id)) }),
  };
}

/** One terrain edit: set the tile at a row-major `index` to `value` ({@link TerrainTile}). */
export interface TileEdit {
  index: number;
  value: TerrainTile;
}

/**
 * Paint terrain tiles, capturing each cell's prior value so the whole stroke
 * undoes as one entry. No-op cells (already the target value) are dropped, so an
 * all-redundant stroke produces a command that changes nothing. Returns a fresh
 * `tiles` array on execute/undo so terrain renderers keyed on identity redraw.
 */
export function setTiles(
  doc: LevelDocument,
  edits: readonly TileEdit[],
  label = "Paint tiles",
): EditorCommand {
  const before: TileEdit[] = [];
  const after: TileEdit[] = [];
  for (const edit of edits) {
    const prev = doc.tiles[edit.index] ?? TerrainTile.Empty;
    if (prev === edit.value) continue;
    before.push({ index: edit.index, value: prev });
    after.push(edit);
  }
  const apply =
    (list: readonly TileEdit[]) =>
    (d: LevelDocument): LevelDocument => {
      if (list.length === 0) return d;
      const tiles = d.tiles.slice();
      for (const { index, value } of list) tiles[index] = value;
      return { ...d, tiles };
    };
  return { label, execute: apply(after), undo: apply(before) };
}

export interface MoveTilesResult {
  command: EditorCommand;
  nextIndices: number[];
}

/**
 * Move terrain cells by a grid offset. Sources are cleared then written to the
 * destination so overlapping selections stay coherent; any out-of-bounds target
 * aborts the whole move. Slope profiles keyed by cell index move with them.
 */
export function moveTiles(
  doc: LevelDocument,
  indices: readonly number[],
  dCol: number,
  dRow: number,
): MoveTilesResult | null {
  if (dCol === 0 && dRow === 0) return null;
  const unique = [...new Set(indices)];
  if (unique.length === 0) return null;

  const { cols, rows, tiles } = doc;
  type Payload = { from: number; to: number; value: TerrainTile; slope?: [number, number] };
  const payloads: Payload[] = [];
  for (const from of unique) {
    if (from < 0 || from >= tiles.length) return null;
    const col = from % cols;
    const row = Math.floor(from / cols);
    const toCol = col + dCol;
    const toRow = row + dRow;
    if (toCol < 0 || toRow < 0 || toCol >= cols || toRow >= rows) return null;
    payloads.push({
      from,
      to: toRow * cols + toCol,
      value: tiles[from] ?? TerrainTile.Empty,
      slope: doc.slopes?.[from],
    });
  }

  const afterTiles = tiles.slice();
  const afterSlopes: Record<number, [number, number]> = { ...doc.slopes };
  for (const p of payloads) {
    afterTiles[p.from] = TerrainTile.Empty;
    delete afterSlopes[p.from];
  }
  for (const p of payloads) {
    afterTiles[p.to] = p.value;
    if (p.slope) afterSlopes[p.to] = [...p.slope] as [number, number];
    else delete afterSlopes[p.to];
  }

  const beforeTiles = tiles.slice();
  const beforeSlopes = doc.slopes ? { ...doc.slopes } : undefined;
  const slopesAfter = Object.keys(afterSlopes).length > 0 ? afterSlopes : undefined;

  return {
    nextIndices: payloads.map((p) => p.to),
    command: {
      label: "Move tiles",
      execute: (d) => ({
        ...d,
        tiles: afterTiles.slice(),
        slopes: slopesAfter ? { ...slopesAfter } : undefined,
      }),
      undo: (d) => ({
        ...d,
        tiles: beforeTiles.slice(),
        slopes: beforeSlopes ? { ...beforeSlopes } : undefined,
      }),
    },
  };
}

/** Editable level ("room") settings: identity, grid pitch, and terrain extent. */
export interface LevelSettings {
  name: string;
  gridSize: number;
  cols: number;
  rows: number;
}

/** Crop/pad row-major terrain to new dimensions, keeping cells by (col, row). */
function reshapeTiles(
  tiles: readonly TerrainTile[],
  oldCols: number,
  oldRows: number,
  newCols: number,
  newRows: number,
): TerrainTile[] {
  const out = new Array<TerrainTile>(newCols * newRows).fill(TerrainTile.Empty);
  const copyRows = Math.min(oldRows, newRows);
  const copyCols = Math.min(oldCols, newCols);
  for (let r = 0; r < copyRows; r++)
    for (let c = 0; c < copyCols; c++)
      out[r * newCols + c] = tiles[r * oldCols + c] ?? TerrainTile.Empty;
  return out;
}

/** Re-key slope profiles onto the resized grid, dropping any now out of bounds. */
function remapSlopes(
  slopes: LevelDocument["slopes"],
  oldCols: number,
  newCols: number,
  newRows: number,
): LevelDocument["slopes"] {
  if (!slopes) return undefined;
  const out: Record<number, [number, number]> = {};
  for (const [key, value] of Object.entries(slopes)) {
    const index = Number(key);
    const col = index % oldCols;
    const row = Math.floor(index / oldCols);
    if (col < newCols && row < newRows) out[row * newCols + col] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Edit the level's name, grid pitch and dimensions in one reversible step. When
 * the tile extent changes the terrain is reshaped (cropped/padded with empty)
 * and slopes are re-keyed, so a shrink discards off-grid cells rather than
 * corrupting the row-major layout. Takes the document at creation time so both
 * directions of the change are fully captured.
 */
export function setLevelSettings(doc: LevelDocument, next: LevelSettings): EditorCommand {
  const before: LevelSettings = {
    name: doc.name,
    gridSize: doc.gridSize,
    cols: doc.cols,
    rows: doc.rows,
  };
  const resized = next.cols !== doc.cols || next.rows !== doc.rows;
  const afterTiles = resized
    ? reshapeTiles(doc.tiles, doc.cols, doc.rows, next.cols, next.rows)
    : doc.tiles;
  const afterSlopes = resized
    ? remapSlopes(doc.slopes, doc.cols, next.cols, next.rows)
    : doc.slopes;
  const beforeTiles = doc.tiles;
  const beforeSlopes = doc.slopes;

  const apply =
    (settings: LevelSettings, tiles: TerrainTile[], slopes: LevelDocument["slopes"]) =>
    (d: LevelDocument): LevelDocument => {
      const out: LevelDocument = { ...d, ...settings, tiles };
      if (slopes) out.slopes = slopes;
      else delete out.slopes;
      return out;
    };

  return {
    label: "Level settings",
    execute: apply(next, afterTiles, afterSlopes),
    undo: apply(before, beforeTiles, beforeSlopes),
  };
}

/**
 * Delete objects, capturing their original positions so undo restores order.
 * Takes the document at creation time so the removed instances are recoverable.
 */
export function deleteObjects(doc: LevelDocument, ids: readonly string[]): EditorCommand {
  const idSet = new Set(ids);
  const removed = doc.objects.map((o, index) => ({ o, index })).filter((e) => idSet.has(e.o.id));
  return {
    label: removed.length > 1 ? "Delete objects" : "Delete",
    execute: (d) => ({ ...d, objects: d.objects.filter((o) => !idSet.has(o.id)) }),
    undo: (d) => {
      const objects = [...d.objects];
      for (const { o, index } of removed) objects.splice(Math.min(index, objects.length), 0, o);
      return { ...d, objects };
    },
  };
}

/**
 * Delete decorations, capturing their original positions so undo restores order.
 */
export function deleteDecorations(doc: LevelDocument, ids: readonly string[]): EditorCommand {
  const idSet = new Set(ids);
  const removed = doc.decorations
    .map((d, index) => ({ d, index }))
    .filter((e) => idSet.has(e.d.id));
  return {
    label: removed.length > 1 ? "Delete decorations" : "Delete decoration",
    execute: (d) => ({ ...d, decorations: d.decorations.filter((x) => !idSet.has(x.id)) }),
    undo: (d) => {
      const decorations = [...d.decorations];
      for (const { d: inst, index } of removed)
        decorations.splice(Math.min(index, decorations.length), 0, inst);
      return { ...d, decorations };
    },
  };
}

/** Undo/redo stacks over a live document. */
export class History {
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];

  constructor(private doc: LevelDocument) {}

  get document(): LevelDocument {
    return this.doc;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Label of the command undo would reverse, for the toolbar tooltip. */
  get undoLabel(): string | undefined {
    return this.undoStack[this.undoStack.length - 1]?.label;
  }

  get redoLabel(): string | undefined {
    return this.redoStack[this.redoStack.length - 1]?.label;
  }

  execute(command: EditorCommand): LevelDocument {
    this.doc = command.execute(this.doc);
    this.undoStack.push(command);
    this.redoStack.length = 0;
    return this.doc;
  }

  undo(): LevelDocument | null {
    const command = this.undoStack.pop();
    if (!command) return null;
    this.doc = command.undo(this.doc);
    this.redoStack.push(command);
    return this.doc;
  }

  redo(): LevelDocument | null {
    const command = this.redoStack.pop();
    if (!command) return null;
    this.doc = command.execute(this.doc);
    this.undoStack.push(command);
    return this.doc;
  }

  /** Replace the document and clear history — used when opening a new level. */
  reset(doc: LevelDocument): void {
    this.doc = doc;
    this.undoStack = [];
    this.redoStack = [];
  }
}
