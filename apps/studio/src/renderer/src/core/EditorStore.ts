import {
  History,
  definitionFor,
  type DecorationLayer,
  type EditorCommand,
  type LevelObjectInstance,
  type LevelDocument,
  type ValidationResult,
  TerrainTile,
} from "@mmx/content-schema";
import type { CompiledGameData } from "@mmx/engine/data";
import type { TilesetAsset } from "@mmx/project-schema";
import { validateLevelDocument } from "@mmx/editor-runtime/adapters";
import type { PlayTrail } from "@mmx/editor-runtime";
import { getDecorationAsset, knownDecorationAssetIds } from "@mmx/renderer-pixi";

export type Tool = "select" | "pan" | "place" | "placeDecoration" | "resize" | "tile" | "tilePaint";
export type TilePaintMode = "brush" | "rect" | "fill" | "erase";

/** What the `tilePaint` tool paints: a tileset tile into one tile layer. */
export interface TilePaint {
  layerId?: string;
  /** Tile index in the layer's tileset. */
  tile: number;
  mode: TilePaintMode;
}
export type Mode = "edit" | "play";

export type EditorSelection =
  | { kind: "objects"; ids: string[] }
  | { kind: "decorations"; ids: string[] }
  | { kind: "tiles"; indices: number[] };

export type EditorHover =
  | { kind: "object"; id: string }
  | { kind: "decoration"; id: string }
  | { kind: "tile"; index: number };

/**
 * One row of the Layers panel: object instances, cameras, the collision terrain, a
 * decoration layer's catalog decorations (by layer name), or a tile / image layer by id.
 */
export type LayerKey =
  | "objects"
  | "cameras"
  | "collision"
  | DecorationLayer
  | `tile:${string}`
  | `image:${string}`;

type LayerFlags = Readonly<Partial<Record<LayerKey, boolean>>>;

/** Cameras get their own layer; every other object instance is on `objects`. */
export function objectLayerKey(inst: Pick<LevelObjectInstance, "definitionId">): LayerKey {
  return definitionFor(inst.definitionId).category === "camera" ? "cameras" : "objects";
}

export function isLayerVisible(state: Pick<EditorState, "layerVisible">, key: LayerKey): boolean {
  return state.layerVisible[key] !== false;
}

export function isLayerLocked(state: Pick<EditorState, "layerLocked">, key: LayerKey): boolean {
  return state.layerLocked[key] === true;
}

/** Shown and unlocked: the viewport may select from or paint into the layer. */
export function isLayerEditable(
  state: Pick<EditorState, "layerVisible" | "layerLocked">,
  key: LayerKey,
): boolean {
  return isLayerVisible(state, key) && !isLayerLocked(state, key);
}

/**
 * The layer the active tool writes to: collision for `tile`, the paint layer for `tilePaint`,
 * the placed object's or decoration's layer for `place` / `placeDecoration`.
 */
export function toolTargetKey(
  state: Pick<EditorState, "activeTool" | "tilePaint" | "placingDefinitionId" | "placingAssetId">,
): LayerKey | undefined {
  switch (state.activeTool) {
    case "tile":
      return "collision";
    case "tilePaint":
      return state.tilePaint.layerId ? `tile:${state.tilePaint.layerId}` : undefined;
    case "place":
      return state.placingDefinitionId
        ? objectLayerKey({ definitionId: state.placingDefinitionId })
        : undefined;
    case "placeDecoration":
      return state.placingAssetId
        ? getDecorationAsset(state.placingAssetId)?.defaultLayer
        : undefined;
    default:
      return undefined;
  }
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
  /** Editor-only, by {@link LayerKey}: `false` hides the layer (absent = shown). */
  layerVisible: LayerFlags;
  /** Editor-only: a locked layer stays drawn but is neither selected nor painted (absent = unlocked). */
  layerLocked: LayerFlags;
  /** The open project's `tileset` assets by id (tile geometry and collision per tile). */
  tilesets: Readonly<Record<string, TilesetAsset>>;
  tilePaint: TilePaint;
  /** Editor-only: the player's path in the last Play of this level (never saved). */
  trail: PlayTrail | null;
  trailVisible: boolean;
}

/** Why the store emitted — lets subscribers skip expensive work they don't need. */
export type ChangeReason = "open" | "document" | "selection" | "view" | "ui" | "mode";

type Listener = (state: EditorState, reason: ChangeReason) => void;

export class EditorStore {
  private history: History;
  private state: EditorState;
  private listeners = new Set<Listener>();
  private savedRef: LevelDocument;
  private opens = 0;

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
      layerVisible: {},
      layerLocked: {},
      tilesets: {},
      tilePaint: { tile: 0, mode: "brush" },
      trail: null,
      trailVisible: true,
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
    this.opens++;
    this.state = {
      ...this.state,
      document,
      selection: emptySelection(),
      hover: undefined,
      activeTool: "select",
      placingDefinitionId: undefined,
      placingAssetId: undefined,
      mode: "edit",
      layerVisible: {},
      layerLocked: {},
      trail: null,
    };
    this.emit("open");
  }

  /** How many documents were opened: tells work started on one document from the next. */
  get openCount(): number {
    return this.opens;
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

  setLayerVisible(key: LayerKey, visible: boolean): void {
    this.patch({ layerVisible: { ...this.state.layerVisible, [key]: visible } }, "ui");
  }

  setLayerLocked(key: LayerKey, locked: boolean): void {
    this.patch({ layerLocked: { ...this.state.layerLocked, [key]: locked } }, "ui");
  }

  setMode(mode: Mode): void {
    this.patch({ mode }, "mode");
  }

  setTilesets(tilesets: Record<string, TilesetAsset>): void {
    this.patch({ tilesets }, "ui");
  }

  /** A new trail replaces the last one and is shown; null clears it. */
  setTrail(trail: PlayTrail | null): void {
    this.patch({ trail, trailVisible: true }, "ui");
  }

  toggleTrail(): void {
    this.patch({ trailVisible: !this.state.trailVisible }, "ui");
  }

  setTilePaint(patch: Partial<TilePaint>): void {
    this.patch({ tilePaint: { ...this.state.tilePaint, ...patch } }, "ui");
  }

  // --- Derived ---

  /**
   * `imageAssetIds` / `tilesets`: the open project's `image` and `tileset` assets, so
   * image and tile layers are cross-checked (tileset values are tile counts, or undefined).
   * `assets`: every project asset id → kind, so `asset` properties are cross-checked.
   * `gameData`: the project's compiled game data, which Play builds the scene from.
   * `enemySheets`: the enemy sheets Play has animations for (unchecked when undefined).
   */
  validate(
    imageAssetIds?: readonly string[],
    tilesets?: ReadonlyMap<string, number | undefined>,
    assets?: ReadonlyMap<string, string>,
    gameData?: CompiledGameData,
    enemySheets?: ReadonlySet<string>,
  ): ValidationResult {
    return validateLevelDocument(
      this.state.document,
      {
        knownDecorationAssetIds: knownDecorationAssetIds(),
        imageAssetIds,
        tilesets,
        assets,
      },
      gameData,
      enemySheets,
    );
  }

  /** Snap a world coordinate to the grid when snapping is on. */
  snap(value: number): number {
    if (!this.state.snapEnabled) return value;
    const g = this.state.document.gridSize;
    return Math.round(value / g) * g;
  }
}
