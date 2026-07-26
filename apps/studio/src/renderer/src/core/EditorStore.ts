import {
  History,
  DECORATION_LAYERS,
  type DecorationLayer,
  type EditorCommand,
  type LevelDocument,
  type ValidationResult,
  TerrainTile,
} from "@mmx/content-schema";
import { validateLevelDocument } from "@mmx/content-engine-adapter";
import { knownDecorationAssetIds } from "@mmx/renderer-pixi";

export type Tool = "select" | "pan" | "place" | "placeDecoration" | "resize" | "tile";
export type Mode = "edit" | "play";

export type EditorSelection =
  | { kind: "objects"; ids: string[] }
  | { kind: "decorations"; ids: string[] }
  | { kind: "tiles"; indices: number[] };

export type EditorHover =
  | { kind: "object"; id: string }
  | { kind: "decoration"; id: string }
  | { kind: "tile"; index: number };

export type LayerVisibility = Record<DecorationLayer, boolean>;
export type LayerLocks = Record<DecorationLayer, boolean>;

function allLayersTrue(): LayerVisibility {
  return Object.fromEntries(DECORATION_LAYERS.map((l) => [l, true])) as LayerVisibility;
}

function allLayersFalse(): LayerLocks {
  return Object.fromEntries(DECORATION_LAYERS.map((l) => [l, false])) as LayerLocks;
}

export function emptySelection(): EditorSelection {
  return { kind: "objects", ids: [] };
}

export function selectionSize(sel: EditorSelection): number {
  return sel.kind === "tiles" ? sel.indices.length : sel.ids.length;
}

export function isSelectionEmpty(sel: EditorSelection): boolean {
  return selectionSize(sel) === 0;
}

export function selectedObjectIds(sel: EditorSelection): string[] {
  return sel.kind === "objects" ? sel.ids : [];
}

export function selectedDecorationIds(sel: EditorSelection): string[] {
  return sel.kind === "decorations" ? sel.ids : [];
}

export function selectedTileIndices(sel: EditorSelection): number[] {
  return sel.kind === "tiles" ? sel.indices : [];
}

export function cloneSelection(sel: EditorSelection): EditorSelection {
  if (sel.kind === "objects") return { kind: "objects", ids: [...sel.ids] };
  if (sel.kind === "decorations") return { kind: "decorations", ids: [...sel.ids] };
  return { kind: "tiles", indices: [...sel.indices] };
}

export function selectionsEqual(a: EditorSelection, b: EditorSelection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "objects" && b.kind === "objects") {
    return a.ids.length === b.ids.length && a.ids.every((id) => b.ids.includes(id));
  }
  if (a.kind === "decorations" && b.kind === "decorations") {
    return a.ids.length === b.ids.length && a.ids.every((id) => b.ids.includes(id));
  }
  if (a.kind === "tiles" && b.kind === "tiles") {
    return a.indices.length === b.indices.length && a.indices.every((i) => b.indices.includes(i));
  }
  return false;
}

export function hoversEqual(a: EditorHover | undefined, b: EditorHover | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "object" && b.kind === "object") return a.id === b.id;
  if (a.kind === "decoration" && b.kind === "decoration") return a.id === b.id;
  if (a.kind === "tile" && b.kind === "tile") return a.index === b.index;
  return false;
}

/**
 * Temporary UI state, kept strictly out of the saved {@link LevelDocument}. The
 * document is owned by {@link History}; everything below is view/selection state
 * that must never leak into the file (see the editor README).
 */
export interface EditorState {
  document: LevelDocument;
  selection: EditorSelection;
  hover?: EditorHover;
  activeTool: Tool;
  /** Definition id to place while `activeTool === "place"`. */
  placingDefinitionId?: string;
  /** Decoration asset id to place while `activeTool === "placeDecoration"`. */
  placingAssetId?: string;
  /** Device-independent world→screen zoom. */
  zoom: number;
  /** World coordinate shown at the viewport's top-left corner. */
  viewportPosition: { x: number; y: number };
  gridVisible: boolean;
  snapEnabled: boolean;
  mode: Mode;
  /** Editor-only: which decoration layers are drawn. */
  decorationLayerVisible: LayerVisibility;
  /** Editor-only: locked layers stay visible but are not selectable. */
  decorationLayerLocked: LayerLocks;
}

/** Why the store emitted — lets subscribers skip expensive work they don't need. */
export type ChangeReason = "open" | "document" | "selection" | "view" | "ui" | "mode";

type Listener = (state: EditorState, reason: ChangeReason) => void;

export class EditorStore {
  private history: History;
  private state: EditorState;
  private listeners = new Set<Listener>();
  private savedRef: LevelDocument;

  constructor(document: LevelDocument) {
    this.history = new History(document);
    this.savedRef = document;
    this.state = {
      document,
      selection: emptySelection(),
      activeTool: "select",
      zoom: 2,
      viewportPosition: { x: 0, y: 0 },
      gridVisible: true,
      snapEnabled: true,
      mode: "edit",
      decorationLayerVisible: allLayersTrue(),
      decorationLayerLocked: allLayersFalse(),
    };
  }

  get(): EditorState {
    return this.state;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }
  get canRedo(): boolean {
    return this.history.canRedo;
  }
  get undoLabel(): string | undefined {
    return this.history.undoLabel;
  }
  get redoLabel(): string | undefined {
    return this.history.redoLabel;
  }
  get isDirty(): boolean {
    return this.state.document !== this.savedRef;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(reason: ChangeReason): void {
    for (const fn of this.listeners) fn(this.state, reason);
  }

  private patch(partial: Partial<EditorState>, reason: ChangeReason): void {
    this.state = { ...this.state, ...partial };
    this.emit(reason);
  }

  // --- Document mutations (undoable) ---

  execute(command: EditorCommand): void {
    this.patch({ document: this.history.execute(command) }, "document");
  }

  undo(): void {
    const doc = this.history.undo();
    if (doc) this.patch({ document: doc, selection: this.pruneSelection(doc) }, "document");
  }

  redo(): void {
    const doc = this.history.redo();
    if (doc) this.patch({ document: doc, selection: this.pruneSelection(doc) }, "document");
  }

  private pruneSelection(doc: LevelDocument): EditorSelection {
    const sel = this.state.selection;
    if (sel.kind === "objects") {
      const alive = new Set(doc.objects.map((o) => o.id));
      return { kind: "objects", ids: sel.ids.filter((id) => alive.has(id)) };
    }
    if (sel.kind === "decorations") {
      const alive = new Set(doc.decorations.map((d) => d.id));
      return { kind: "decorations", ids: sel.ids.filter((id) => alive.has(id)) };
    }
    const max = doc.cols * doc.rows;
    return {
      kind: "tiles",
      indices: sel.indices.filter(
        (i) => i >= 0 && i < max && (doc.tiles[i] ?? TerrainTile.Empty) !== TerrainTile.Empty,
      ),
    };
  }

  /** Open a fresh document; clears history and selection. */
  open(document: LevelDocument): void {
    this.history.reset(document);
    this.savedRef = document;
    this.state = {
      ...this.state,
      document,
      selection: emptySelection(),
      hover: undefined,
      activeTool: "select",
      placingDefinitionId: undefined,
      placingAssetId: undefined,
      mode: "edit",
      decorationLayerVisible: allLayersTrue(),
      decorationLayerLocked: allLayersFalse(),
    };
    this.emit("open");
  }

  /** Mark the current document as the on-disk baseline (after a save). */
  markSaved(): void {
    this.savedRef = this.state.document;
    this.emit("ui");
  }

  // --- Selection ---

  selectObjects(ids: string[]): void {
    const next: EditorSelection = { kind: "objects", ids };
    if (selectionsEqual(this.state.selection, next)) return;
    this.patch({ selection: next }, "selection");
  }

  selectDecorations(ids: string[]): void {
    const next: EditorSelection = { kind: "decorations", ids };
    if (selectionsEqual(this.state.selection, next)) return;
    this.patch({ selection: next }, "selection");
  }

  selectTiles(indices: number[]): void {
    const next: EditorSelection = { kind: "tiles", indices };
    if (selectionsEqual(this.state.selection, next)) return;
    this.patch({ selection: next }, "selection");
  }

  setSelection(selection: EditorSelection): void {
    if (selectionsEqual(this.state.selection, selection)) return;
    this.patch({ selection: cloneSelection(selection) }, "selection");
  }

  toggleObjectInSelection(id: string): void {
    if (this.state.selection.kind !== "objects") {
      this.patch({ selection: { kind: "objects", ids: [id] } }, "selection");
      return;
    }
    const set = new Set(this.state.selection.ids);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.patch({ selection: { kind: "objects", ids: [...set] } }, "selection");
  }

  toggleDecorationInSelection(id: string): void {
    if (this.state.selection.kind !== "decorations") {
      this.patch({ selection: { kind: "decorations", ids: [id] } }, "selection");
      return;
    }
    const set = new Set(this.state.selection.ids);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.patch({ selection: { kind: "decorations", ids: [...set] } }, "selection");
  }

  toggleTileInSelection(index: number): void {
    if (this.state.selection.kind !== "tiles") {
      this.patch({ selection: { kind: "tiles", indices: [index] } }, "selection");
      return;
    }
    const set = new Set(this.state.selection.indices);
    if (set.has(index)) set.delete(index);
    else set.add(index);
    this.patch({ selection: { kind: "tiles", indices: [...set] } }, "selection");
  }

  clearSelection(): void {
    if (!isSelectionEmpty(this.state.selection)) {
      this.patch({ selection: emptySelection() }, "selection");
    }
  }

  setHover(hover: EditorHover | undefined): void {
    if (hoversEqual(hover, this.state.hover)) return;
    this.patch({ hover }, "selection");
  }

  // --- Tools & view ---

  setTool(tool: Tool, placingId?: string): void {
    if (tool === "place") {
      this.patch(
        { activeTool: tool, placingDefinitionId: placingId, placingAssetId: undefined },
        "ui",
      );
      return;
    }
    if (tool === "placeDecoration") {
      this.patch(
        { activeTool: tool, placingAssetId: placingId, placingDefinitionId: undefined },
        "ui",
      );
      return;
    }
    this.patch(
      { activeTool: tool, placingDefinitionId: undefined, placingAssetId: undefined },
      "ui",
    );
  }

  setView(zoom: number, viewportPosition: { x: number; y: number }): void {
    this.patch({ zoom, viewportPosition }, "view");
  }

  toggleGrid(): void {
    this.patch({ gridVisible: !this.state.gridVisible }, "ui");
  }

  toggleSnap(): void {
    this.patch({ snapEnabled: !this.state.snapEnabled }, "ui");
  }

  setDecorationLayerVisible(layer: DecorationLayer, visible: boolean): void {
    this.patch(
      {
        decorationLayerVisible: { ...this.state.decorationLayerVisible, [layer]: visible },
      },
      "ui",
    );
  }

  setDecorationLayerLocked(layer: DecorationLayer, locked: boolean): void {
    this.patch(
      {
        decorationLayerLocked: { ...this.state.decorationLayerLocked, [layer]: locked },
      },
      "ui",
    );
  }

  setMode(mode: Mode): void {
    this.patch({ mode }, "mode");
  }

  // --- Derived ---

  validate(): ValidationResult {
    return validateLevelDocument(this.state.document, {
      knownDecorationAssetIds: knownDecorationAssetIds(),
    });
  }

  /** Snap a world coordinate to the grid when snapping is on. */
  snap(value: number): number {
    if (!this.state.snapEnabled) return value;
    const g = this.state.document.gridSize;
    return Math.round(value / g) * g;
  }
}
