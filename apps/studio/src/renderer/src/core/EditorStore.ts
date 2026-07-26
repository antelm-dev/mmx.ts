import {
  History,
  validateLevelDocument,
  type EditorCommand,
  type LevelDocument,
  type ValidationResult,
} from "@mmx/content-schema";
import { Tile } from "@mmx/engine/game/World.js";

export type Tool = "select" | "pan" | "place" | "resize" | "tile";
export type Mode = "edit" | "play";

export type EditorSelection =
  | { kind: "objects"; ids: string[] }
  | { kind: "tiles"; indices: number[] };

export type EditorHover =
  | { kind: "object"; id: string }
  | { kind: "tile"; index: number };

export function emptySelection(): EditorSelection {
  return { kind: "objects", ids: [] };
}

export function selectionSize(sel: EditorSelection): number {
  return sel.kind === "objects" ? sel.ids.length : sel.indices.length;
}

export function isSelectionEmpty(sel: EditorSelection): boolean {
  return selectionSize(sel) === 0;
}

export function selectedObjectIds(sel: EditorSelection): string[] {
  return sel.kind === "objects" ? sel.ids : [];
}

export function selectedTileIndices(sel: EditorSelection): number[] {
  return sel.kind === "tiles" ? sel.indices : [];
}

export function cloneSelection(sel: EditorSelection): EditorSelection {
  return sel.kind === "objects"
    ? { kind: "objects", ids: [...sel.ids] }
    : { kind: "tiles", indices: [...sel.indices] };
}

export function selectionsEqual(a: EditorSelection, b: EditorSelection): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "objects" && b.kind === "objects") {
    return a.ids.length === b.ids.length && a.ids.every((id) => b.ids.includes(id));
  }
  if (a.kind === "tiles" && b.kind === "tiles") {
    return (
      a.indices.length === b.indices.length && a.indices.every((i) => b.indices.includes(i))
    );
  }
  return false;
}

export function hoversEqual(a: EditorHover | undefined, b: EditorHover | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  if (a.kind === "object" && b.kind === "object") return a.id === b.id;
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
  /** Device-independent world→screen zoom. */
  zoom: number;
  /** World coordinate shown at the viewport's top-left corner. */
  viewportPosition: { x: number; y: number };
  gridVisible: boolean;
  snapEnabled: boolean;
  mode: Mode;
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
    const max = doc.cols * doc.rows;
    return {
      kind: "tiles",
      indices: sel.indices.filter(
        (i) => i >= 0 && i < max && (doc.tiles[i] ?? Tile.Empty) !== Tile.Empty,
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
      mode: "edit",
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

  setTool(tool: Tool, placingDefinitionId?: string): void {
    this.patch({ activeTool: tool, placingDefinitionId }, "ui");
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

  setMode(mode: Mode): void {
    this.patch({ mode }, "mode");
  }

  // --- Derived ---

  validate(): ValidationResult {
    return validateLevelDocument(this.state.document);
  }

  /** Snap a world coordinate to the grid when snapping is on. */
  snap(value: number): number {
    if (!this.state.snapEnabled) return value;
    const g = this.state.document.gridSize;
    return Math.round(value / g) * g;
  }
}
