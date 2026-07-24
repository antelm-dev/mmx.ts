import { instanceSize, type LevelDocument, type ValidationResult } from "@mmx/content-schema";
import { EditorStore, type ChangeReason, type EditorState } from "../core/EditorStore.js";
import {
  deleteSelection,
  duplicateSelection,
  nudgeSelection,
  placeAt,
} from "../core/actions.js";
import { EditorViewport } from "../core/EditorViewport.js";
import { PlaySession } from "../core/PlaySession.js";
import { BUILTIN_LEVELS } from "../core/builtins.js";
import {
  createFileAccess,
  parseDocument,
  serializeDocument,
  writeRecovery,
  type FileAccess,
} from "../core/persistence.js";
import { useUiStore } from "../store/uiStore.js";

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
  activeLevelKey: string | null;
  levelTitle: string;
}

/**
 * The framework-agnostic façade over the {@link EditorStore}, the Pixi viewport,
 * and the Play session — the React port of the old Angular `EditorService`. All
 * open/save/play/zoom orchestration lives here; the React components stay thin
 * views over {@link EditorSnapshot} and the Zustand UI store.
 */
export class EditorController {
  readonly store = new EditorStore(BUILTIN_LEVELS[0].document());
  readonly levels = BUILTIN_LEVELS;

  private readonly fileAccess: FileAccess = createFileAccess();
  private viewport: EditorViewport | null = null;
  private play: PlaySession | null = null;
  private host: HTMLElement | null = null;

  private savedView: { zoom: number; viewportPosition: { x: number; y: number } } | null = null;
  private savedSelection: string[] = [];
  private activeLevelKey: string | null = "stage1";

  private snapshot: EditorSnapshot;
  private readonly listeners = new Set<() => void>();

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

  private computeTitle(): string {
    if (this.activeLevelKey) {
      const level = this.levels.find((l) => l.key === this.activeLevelKey);
      if (level) return level.name;
    }
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
      activeLevelKey: this.activeLevelKey,
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

  // ---------- File ----------

  save(): void {
    const doc = this.store.get().document;
    void this.fileAccess.save(doc.id || doc.name || "level", serializeDocument(doc));
    this.store.markSaved();
    this.toast("Level saved.");
  }

  async importJson(): Promise<void> {
    try {
      const opened = await this.fileAccess.open();
      if (!opened) return;
      this.openDocument(parseDocument(opened.json), null);
      this.toast(`Imported ${opened.name}.`);
    } catch (error) {
      this.toast(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  openBuiltin(key: string): void {
    const level = this.levels.find((l) => l.key === key);
    if (!level) return;
    if (this.store.get().mode === "play") this.togglePlay();
    this.openDocument(level.document(), key);
  }

  private openDocument(doc: LevelDocument, levelKey: string | null): void {
    this.activeLevelKey = levelKey;
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

  focusObject(id: string): void {
    const inst = this.store.get().document.objects.find((o) => o.id === id);
    if (!inst) return;
    this.store.select([id]);
    const { width, height } = instanceSize(inst);
    this.viewport?.centerOn(inst.x + width / 2, inst.y + height / 2);
  }

  // ---------- Play ----------

  togglePlay(): void {
    if (this.store.get().mode === "play") this.stopPlay();
    else void this.startPlay();
  }

  private async startPlay(): Promise<void> {
    if (!this.host) return;
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
    this.savedSelection = [...state.selectedIds];

    this.store.setMode("play");
    this.viewport?.setVisible(false);
    try {
      this.play = await PlaySession.start(this.host, state.document, (message) => {
        this.toast(`Play error: ${message}`);
        this.stopPlay();
      });
    } catch (error) {
      this.toast(`Could not start Play: ${error instanceof Error ? error.message : String(error)}`);
      this.stopPlay();
    }
  }

  private stopPlay(): void {
    this.play?.stop();
    this.play = null;
    this.store.setMode("edit");
    this.viewport?.setVisible(true);
    if (this.savedView) this.store.setView(this.savedView.zoom, this.savedView.viewportPosition);
    this.store.select(this.savedSelection);
    this.viewport?.redraw();
  }

  // ---------- Keyboard ----------

  handleKeydown(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;
    const state = this.store.get();

    if (state.mode === "play") {
      if (e.code === "Escape" || (mod && e.code === "Enter")) {
        e.preventDefault();
        this.togglePlay();
      }
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
        if (state.activeTool === "place") this.store.setTool("select");
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
