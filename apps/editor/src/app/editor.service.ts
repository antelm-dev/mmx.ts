import { Injectable, computed, inject, signal } from "@angular/core";
import { MatSnackBar } from "@angular/material/snack-bar";
import { instanceSize, type LevelDocument, type ValidationResult } from "@mmx/content-schema";
import { EditorStore, type EditorState } from "../state/EditorStore.js";
import { deleteSelection, duplicateSelection, nudgeSelection } from "../state/actions.js";
import { EditorViewport } from "../viewport/EditorViewport.js";
import { PlaySession } from "../play/PlaySession.js";
import { BUILTIN_LEVELS } from "../levels/builtins.js";
import {
  BrowserFileAccess,
  parseDocument,
  serializeDocument,
  writeRecovery,
  type FileAccess,
} from "../io/persistence.js";

/**
 * The single Angular-facing façade over the framework-agnostic {@link EditorStore},
 * the Pixi viewport, and the Play session.
 *
 * The store keeps its own subscribe/emit model (shared with the non-Angular
 * viewport and the pure command history); this service mirrors it into Angular
 * signals so the Material components render reactively under zoneless change
 * detection. All the orchestration that used to live in the vanilla `Shell`
 * (open/save/play/zoom/…) moved here unchanged in behaviour.
 */
@Injectable({ providedIn: "root" })
export class EditorService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly fileAccess: FileAccess = new BrowserFileAccess();

  readonly store = new EditorStore(BUILTIN_LEVELS[0].document());
  readonly levels = BUILTIN_LEVELS;

  private viewport: EditorViewport | null = null;
  private play: PlaySession | null = null;
  private host: HTMLElement | null = null;

  private savedView: { zoom: number; viewportPosition: { x: number; y: number } } | null = null;
  private savedSelection: string[] = [];

  // --- Reactive state exposed to components ---
  readonly state = signal<EditorState>(this.store.get());
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly dirty = signal(false);
  readonly validation = signal<ValidationResult>(this.store.validate());
  private readonly activeLevelKey = signal<string | null>("stage1");
  readonly activeLevel = this.activeLevelKey.asReadonly();

  readonly mode = computed(() => this.state().mode);
  readonly zoomPercent = computed(() => Math.round(this.state().zoom * 100));

  constructor() {
    this.store.subscribe((state, reason) => this.onStoreChange(state, reason));
  }

  private onStoreChange(state: EditorState, reason: string): void {
    this.state.set(state);
    this.viewport?.redraw();
    if (reason !== "view") {
      this.canUndo.set(this.store.canUndo);
      this.canRedo.set(this.store.canRedo);
      this.dirty.set(this.store.isDirty);
      this.validation.set(this.store.validate());
    }
    if (reason === "document" || reason === "open") writeRecovery(state.document);
  }

  /** Called by the ViewportComponent once its host element exists. */
  async attachViewport(host: HTMLElement): Promise<void> {
    this.host = host;
    this.viewport = await EditorViewport.create(host, this.store);
    this.viewport.fitToDocument();
    this.viewport.redraw();
  }

  // ---------- File ----------

  save(): void {
    const doc = this.store.get().document;
    void this.fileAccess.save(doc.id || doc.name || "level", serializeDocument(doc));
    this.store.markSaved();
    this.dirty.set(this.store.isDirty);
    this.toast("Level saved to JSON download.");
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
    this.store.open(doc);
    this.activeLevelKey.set(levelKey);
    this.viewport?.fitToDocument();
    this.viewport?.redraw();
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
    this.snackBar.open(message, "Dismiss", {
      duration: 2600,
      horizontalPosition: "end",
      verticalPosition: "bottom",
    });
  }
}
