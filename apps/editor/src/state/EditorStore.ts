import {
  History,
  validateDocument,
  type EditorCommand,
  type LevelDocument,
  type ValidationResult,
} from "@mmx/content-schema";

export type Tool = "select" | "pan" | "place" | "resize";
export type Mode = "edit" | "play";

/**
 * Temporary UI state, kept strictly out of the saved {@link LevelDocument}. The
 * document is owned by {@link History}; everything below is view/selection state
 * that must never leak into the file (see the editor README).
 */
export interface EditorState {
  document: LevelDocument;
  selectedIds: string[];
  hoveredId?: string;
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
      selectedIds: [],
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
    if (doc) this.patch({ document: doc, selectedIds: this.pruneSelection(doc) }, "document");
  }

  redo(): void {
    const doc = this.history.redo();
    if (doc) this.patch({ document: doc, selectedIds: this.pruneSelection(doc) }, "document");
  }

  private pruneSelection(doc: LevelDocument): string[] {
    const alive = new Set(doc.objects.map((o) => o.id));
    return this.state.selectedIds.filter((id) => alive.has(id));
  }

  /** Open a fresh document; clears history and selection. */
  open(document: LevelDocument): void {
    this.history.reset(document);
    this.savedRef = document;
    this.state = {
      ...this.state,
      document,
      selectedIds: [],
      hoveredId: undefined,
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

  select(ids: string[]): void {
    this.patch({ selectedIds: ids }, "selection");
  }

  toggleInSelection(id: string): void {
    const set = new Set(this.state.selectedIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    this.patch({ selectedIds: [...set] }, "selection");
  }

  clearSelection(): void {
    if (this.state.selectedIds.length > 0) this.patch({ selectedIds: [] }, "selection");
  }

  setHover(id: string | undefined): void {
    if (id === this.state.hoveredId) return;
    this.patch({ hoveredId: id }, "selection");
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
    return validateDocument(this.state.document);
  }

  /** Snap a world coordinate to the grid when snapping is on. */
  snap(value: number): number {
    if (!this.state.snapEnabled) return value;
    const g = this.state.document.gridSize;
    return Math.round(value / g) * g;
  }
}
