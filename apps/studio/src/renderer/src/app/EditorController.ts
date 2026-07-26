import {
  createLevelDocument,
  instanceSize,
  type LevelDocument,
  type ValidationResult,
} from "@mmx/content-schema";
import { decorationBounds } from "@mmx/renderer-pixi";
import { GameplaySounds, SoundEffects } from "@mmx/browser-audio";
import {
  emptySelection,
  type EditorSelection,
  type ChangeReason,
  type EditorState,
  EditorStore,
} from "../core/EditorStore.js";
import {
  deleteSelection,
  duplicateSelection,
  nudgeSelection,
  placeAt,
  setTileAt,
} from "../core/actions.js";
import { EditorViewport } from "../core/EditorViewport.js";
import {
  createPlaytest,
  STOPPED_PLAYTEST,
  type EditorPlaytestSession,
  type PlaytestSnapshot,
} from "@mmx/editor-runtime";
import {
  createFileAccess,
  parseDocument,
  readRecovery,
  readRecoveryJson,
  serializeDocument,
  writeRecovery,
  type FileAccess,
} from "../core/persistence.js";
import { useUiStore } from "../store/uiStore.js";

const ZOOM_STEP = 1.2;

/**
 * A single immutable view of everything the React tree renders from. Rebuilt on
 * every store change so it can back a `useSyncExternalStore` snapshot with plain
 * reference equality — pan/zoom ("view") changes carry the previous derived
 * values forward rather than re-validating, matching the Angular service.
 */
export interface EditorSnapshot {
  state: EditorState;
  canUndo: boolean;
  canRedo: boolean;
  dirty: boolean;
  validation: ValidationResult;
  levelTitle: string;
}

/**
 * The framework-agnostic façade over the {@link EditorStore}, the Pixi viewport,
 * and the Play session — the React port of the old Angular `EditorService`. All
 * open/save/play/zoom orchestration lives here; the React components stay thin
 * views over {@link EditorSnapshot} and the Zustand UI store.
 */
export class EditorController {
  readonly store = new EditorStore(createLevelDocument());

  private readonly fileAccess: FileAccess = createFileAccess();
  private viewport: EditorViewport | null = null;
  private play: EditorPlaytestSession | null = null;
  private sounds: GameplaySounds | null = null;
  /** Bumped on every startPlay so an async renderer creation can detect it was superseded. */
  private playToken = 0;
  private host: HTMLElement | null = null;

  private savedView: { zoom: number; viewportPosition: { x: number; y: number } } | null = null;
  private savedSelection: EditorSelection = emptySelection();

  private snapshot: EditorSnapshot;
  private readonly listeners = new Set<() => void>();

  /** Playtest/debugger state, kept out of {@link EditorStore} and the authored document. */
  private playtestSnapshot: PlaytestSnapshot = STOPPED_PLAYTEST;
  private readonly playtestListeners = new Set<() => void>();

  constructor() {
    this.snapshot = this.build("open");
    this.store.subscribe((_, reason) => this.onStoreChange(reason));
    this.syncPageTitle(this.snapshot.levelTitle);
  }

  // ---------- React binding ----------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): EditorSnapshot => this.snapshot;

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  // ---------- Playtest React binding ----------

  subscribePlaytest = (fn: () => void): (() => void) => {
    this.playtestListeners.add(fn);
    return () => this.playtestListeners.delete(fn);
  };

  getPlaytestSnapshot = (): PlaytestSnapshot => this.playtestSnapshot;

  private setPlaytestSnapshot(snapshot: PlaytestSnapshot): void {
    this.playtestSnapshot = snapshot;
    for (const fn of this.playtestListeners) fn();
  }

  private computeTitle(): string {
    return this.store.get().document.name || "Untitled";
  }

  private build(reason: ChangeReason): EditorSnapshot {
    const prev = this.snapshot;
    const keepDerived = reason === "view" && prev !== undefined;
    return {
      state: this.store.get(),
      canUndo: keepDerived ? prev.canUndo : this.store.canUndo,
      canRedo: keepDerived ? prev.canRedo : this.store.canRedo,
      dirty: keepDerived ? prev.dirty : this.store.isDirty,
      validation: keepDerived ? prev.validation : this.store.validate(),
      levelTitle: this.computeTitle(),
    };
  }

  private onStoreChange(reason: ChangeReason): void {
    this.viewport?.redraw();
    if (reason === "document" || reason === "open") writeRecovery(this.store.get().document);
    this.snapshot = this.build(reason);
    this.emit();
  }

  // ---------- Viewport lifecycle ----------

  async attachViewport(host: HTMLElement): Promise<void> {
    this.host = host;
    this.viewport = await EditorViewport.create(host, this.store);
    this.viewport.setEmptyContextMenuHandler((payload) =>
      useUiStore.getState().setContextMenu(payload),
    );
    this.viewport.fitToDocument();
    this.viewport.redraw();
  }

  detachViewport(): void {
    this.viewport?.destroy();
    this.viewport = null;
    this.host = null;
  }

  closeEmptyContextMenu(): void {
    useUiStore.getState().setContextMenu(null);
  }

  openEmptyContextMenuAt(clientX: number, clientY: number): void {
    const payload = this.viewport?.emptyContextAt(clientX, clientY) ?? null;
    useUiStore.getState().setContextMenu(payload);
  }

  placeAtContext(definitionId: string): void {
    const ctx = useUiStore.getState().contextMenu;
    if (!ctx) return;
    placeAt(this.store, definitionId, ctx.worldX, ctx.worldY);
    this.closeEmptyContextMenu();
  }

  /** Add or remove the solid tile at the right-clicked cell. */
  setTileAtContext(solid: boolean): void {
    const ctx = useUiStore.getState().contextMenu;
    if (!ctx) return;
    setTileAt(this.store, ctx.col, ctx.row, solid);
    this.closeEmptyContextMenu();
  }

  /** Toggle the terrain paint tool on/off (returns to Select when turning off). */
  toggleTileTool(): void {
    this.store.setTool(this.store.get().activeTool === "tile" ? "select" : "tile");
  }

  // ---------- File ----------

  /** Start a fresh, blank level with a floor and a single Spawn. */
  newLevel(): void {
    if (!this.confirmDiscardIfDirty("Create a new level?")) return;
    if (this.store.get().mode === "play") this.togglePlay();
    this.openDocument(createLevelDocument());
    this.toast("New level created.");
  }

  save(): void {
    void this.saveAsync();
  }

  private async saveAsync(): Promise<void> {
    const doc = this.store.get().document;
    const ok = await this.fileAccess.save(doc.id || doc.name || "level", serializeDocument(doc));
    if (!ok) return;
    this.store.markSaved();
    this.toast("Level saved.");
  }

  async openLevel(): Promise<void> {
    if (!this.confirmDiscardIfDirty("Open another level?")) return;
    try {
      const opened = await this.fileAccess.open();
      if (!opened) return;
      if (this.store.get().mode === "play") this.togglePlay();
      this.openDocument(parseDocument(opened.json));
      this.toast(`Opened ${opened.name}.`);
    } catch (error) {
      this.toast(`Open failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async copyDocumentJson(): Promise<void> {
    try {
      await navigator.clipboard.writeText(serializeDocument(this.store.get().document));
      this.toast("JSON copied to clipboard.");
    } catch {
      this.toast("Could not copy JSON.");
    }
  }

  hasRecoveryDraft(): boolean {
    const json = readRecoveryJson();
    if (!json) return false;
    return json !== serializeDocument(this.store.get().document);
  }

  restoreRecovery(): void {
    if (!this.confirmDiscardIfDirty("Restore the recovery draft?")) return;
    const doc = readRecovery();
    if (!doc) {
      this.toast("No recovery draft found.");
      return;
    }
    if (this.store.get().mode === "play") this.togglePlay();
    this.openDocument(doc);
    this.toast("Recovery draft restored.");
  }

  private confirmDiscardIfDirty(action: string): boolean {
    if (!this.store.isDirty) return true;
    return window.confirm(`${action}\n\nUnsaved changes will be lost.`);
  }

  private openDocument(doc: LevelDocument): void {
    this.store.open(doc);
    this.syncPageTitle(this.computeTitle());
    this.viewport?.fitToDocument();
    this.viewport?.redraw();
  }

  private syncPageTitle(title: string): void {
    document.title = `${title} · MMX Studio`;
  }

  // ---------- History ----------

  undo(): void {
    this.store.undo();
  }
  redo(): void {
    this.store.redo();
  }

  // ---------- View ----------

  zoomBy(factor: number): void {
    this.viewport?.zoomByCentered(factor);
  }
  zoomIn(): void {
    this.zoomBy(ZOOM_STEP);
  }
  zoomOut(): void {
    this.zoomBy(1 / ZOOM_STEP);
  }
  setZoom(zoom: number): void {
    const current = this.store.get().zoom;
    if (current <= 0 || current === zoom) return;
    this.zoomBy(zoom / current);
  }
  fit(): void {
    this.viewport?.fitToDocument();
  }
  toggleGrid(): void {
    this.store.toggleGrid();
  }
  toggleSnap(): void {
    this.store.toggleSnap();
  }

  // ---------- Objects ----------

  duplicateSelection(): void {
    duplicateSelection(this.store);
  }
  deleteSelection(): void {
    deleteSelection(this.store);
  }

  selectPalette(definitionId: string): void {
    const state = this.store.get();
    if (state.activeTool === "place" && state.placingDefinitionId === definitionId) {
      this.store.setTool("select");
    } else {
      this.store.setTool("place", definitionId);
    }
  }

  selectDecorationPalette(assetId: string): void {
    const state = this.store.get();
    if (state.activeTool === "placeDecoration" && state.placingAssetId === assetId) {
      this.store.setTool("select");
    } else {
      this.store.setTool("placeDecoration", assetId);
    }
  }

  focusDecoration(id: string): void {
    const inst = this.store.get().document.decorations.find((d) => d.id === id);
    if (!inst) return;
    this.store.selectDecorations([id]);
    const bounds = decorationBounds(inst);
    if (bounds) this.viewport?.centerOn(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
    else this.viewport?.centerOn(inst.x, inst.y);
  }

  focusObject(id: string): void {
    const inst = this.store.get().document.objects.find((o) => o.id === id);
    if (!inst) return;
    this.store.selectObjects([id]);
    const { width, height } = instanceSize(inst);
    this.viewport?.centerOn(inst.x + width / 2, inst.y + height / 2);
  }

  /** Add/remove an object from the current selection without recentering. */
  toggleObjectSelection(id: string): void {
    if (!this.store.get().document.objects.some((o) => o.id === id)) return;
    this.store.toggleObjectInSelection(id);
  }

  toggleDecorationSelection(id: string): void {
    if (!this.store.get().document.decorations.some((d) => d.id === id)) return;
    this.store.toggleDecorationInSelection(id);
  }

  // ---------- Play ----------

  togglePlay(): void {
    if (this.store.get().mode === "play") this.stopPlay();
    else void this.startPlay();
  }

  private async startPlay(): Promise<void> {
    if (!this.host) return;
    const sounds = this.getSounds();
    // This stays before the first await so a toolbar click or keyboard shortcut
    // satisfies browser/Electron autoplay policy.
    sounds.effects.unlock();
    this.closeEmptyContextMenu();
    const result = this.store.validate();
    if (!result.ok) {
      this.toast(
        `Fix ${result.errorCount} error${result.errorCount === 1 ? "" : "s"} before playing.`,
      );
      return;
    }
    const state = this.store.get();
    this.savedView = { zoom: state.zoom, viewportPosition: { ...state.viewportPosition } };
    this.savedSelection =
      state.selection.kind === "objects"
        ? { kind: "objects", ids: [...state.selection.ids] }
        : state.selection.kind === "decorations"
          ? { kind: "decorations", ids: [...state.selection.ids] }
          : { kind: "tiles", indices: [...state.selection.indices] };

    const token = ++this.playToken;
    this.store.setMode("play");
    this.viewport?.setVisible(false);
    try {
      await sounds.effects.load();
      const session = createPlaytest(state.document, {
        host: this.host,
        sounds,
        onSnapshot: (snapshot) => {
          if (token !== this.playToken) return;
          this.setPlaytestSnapshot(snapshot);
        },
        onError: (message) => {
          if (token !== this.playToken) return;
          this.toast(`Play error: ${message}`);
          this.stopPlay();
        },
        onExitToObject: (sourceEntityId) => {
          if (token !== this.playToken) return;
          this.stopPlay();
          this.focusObject(sourceEntityId);
        },
      });
      await session.start();
      if (token !== this.playToken || this.store.get().mode !== "play") {
        session.dispose();
        return;
      }
      this.play = session;
    } catch (error) {
      this.toast(`Could not start Play: ${error instanceof Error ? error.message : String(error)}`);
      this.stopPlay();
    }
  }

  private stopPlay(): void {
    this.playToken++;
    this.play?.dispose();
    this.play = null;
    this.setPlaytestSnapshot(STOPPED_PLAYTEST);
    this.store.setMode("edit");
    this.viewport?.setVisible(true);
    if (this.savedView) this.store.setView(this.savedView.zoom, this.savedView.viewportPosition);
    this.store.setSelection(this.savedSelection);
    this.viewport?.redraw();
  }

  /** Lazily create Web Audio only when the user first enters Play mode. */
  private getSounds(): GameplaySounds {
    this.sounds ??= new GameplaySounds(new SoundEffects());
    return this.sounds;
  }

  // ---------- Playtest debugger commands ----------

  playtestTogglePause(): void {
    this.play?.togglePause();
  }
  playtestStep(): void {
    this.play?.step();
  }
  playtestSetCheckpoint(): void {
    this.play?.setCheckpoint();
  }
  playtestRestartCheckpoint(): void {
    this.play?.restartCheckpoint();
  }
  playtestRestartLevel(): void {
    this.play?.restartLevel();
  }
  playtestSelect(runtimeId: string | null): void {
    this.play?.select(runtimeId);
  }
  playtestFocusSource(): void {
    this.play?.focusSelectedSource();
  }

  // ---------- Keyboard ----------

  handleKeydown(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;
    const state = this.store.get();

    if (state.mode === "play") {
      if (e.code === "Escape" || (mod && e.code === "Enter")) {
        e.preventDefault();
        this.togglePlay();
        return;
      }
      // Debugger shortcuts. preventDefault keeps F8/F10 from triggering any
      // browser/Electron devtools or menu default.
      if (e.code === "F8") {
        e.preventDefault();
        if (mod) this.playtestSetCheckpoint();
        else if (e.shiftKey) this.playtestRestartCheckpoint();
        else this.playtestTogglePause();
        return;
      }
      if (e.code === "F10") {
        e.preventDefault();
        this.playtestStep();
        return;
      }
      if (e.code === "F9") {
        e.preventDefault();
        useUiStore.getState().togglePlaytestInspector();
        return;
      }
      return;
    }

    if (e.code === "Escape" && useUiStore.getState().fullscreen) {
      e.preventDefault();
      void window.studio?.window.toggleFullscreen();
      return;
    }

    if (e.code === "Escape" && useUiStore.getState().contextMenu) {
      e.preventDefault();
      this.closeEmptyContextMenu();
      return;
    }

    const target = e.target as HTMLElement | null;
    const typing = target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);

    if (mod && e.code === "KeyZ") {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if (mod && e.code === "KeyY") {
      e.preventDefault();
      this.redo();
      return;
    }
    if (mod && e.code === "KeyS") {
      e.preventDefault();
      this.save();
      return;
    }
    if (mod && e.code === "KeyN") {
      e.preventDefault();
      this.newLevel();
      return;
    }
    if (mod && e.code === "KeyO") {
      e.preventDefault();
      void this.openLevel();
      return;
    }
    if (mod && (e.code === "Equal" || e.code === "NumpadAdd")) {
      e.preventDefault();
      this.zoomIn();
      return;
    }
    if (mod && (e.code === "Minus" || e.code === "NumpadSubtract")) {
      e.preventDefault();
      this.zoomOut();
      return;
    }
    if (mod && e.code === "Digit0") {
      e.preventDefault();
      this.setZoom(1);
      return;
    }
    if (mod && e.code === "KeyD") {
      e.preventDefault();
      this.duplicateSelection();
      return;
    }
    if (mod && e.code === "Enter") {
      e.preventDefault();
      this.togglePlay();
      return;
    }

    if (typing) return;

    switch (e.code) {
      case "Delete":
      case "Backspace":
        e.preventDefault();
        this.deleteSelection();
        break;
      case "Escape":
        if (state.activeTool === "place" || state.activeTool === "placeDecoration" || state.activeTool === "tile")
          this.store.setTool("select");
        else this.store.clearSelection();
        break;
      case "KeyG":
        if (e.shiftKey) this.store.toggleSnap();
        else this.store.toggleGrid();
        break;
      case "KeyF":
        this.fit();
        break;
      case "KeyV":
        this.store.setTool("select");
        break;
      case "KeyT":
        this.toggleTileTool();
        break;
      case "ArrowLeft":
        e.preventDefault();
        nudgeSelection(this.store, e.shiftKey ? -state.document.gridSize : -1, 0);
        break;
      case "ArrowRight":
        e.preventDefault();
        nudgeSelection(this.store, e.shiftKey ? state.document.gridSize : 1, 0);
        break;
      case "ArrowUp":
        e.preventDefault();
        nudgeSelection(this.store, 0, e.shiftKey ? -state.document.gridSize : -1);
        break;
      case "ArrowDown":
        e.preventDefault();
        nudgeSelection(this.store, 0, e.shiftKey ? state.document.gridSize : 1);
        break;
      default:
        break;
    }
  }

  toast(message: string): void {
    useUiStore.getState().addToast(message);
  }
}

/** The one editor instance the whole renderer shares. */
export const editor = new EditorController();
