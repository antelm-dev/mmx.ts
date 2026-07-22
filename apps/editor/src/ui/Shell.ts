import { deleteSelection, duplicateSelection } from "../state/actions.js";
import { EditorStore } from "../state/EditorStore.js";
import { EditorViewport } from "../viewport/EditorViewport.js";
import { PlaySession } from "../play/PlaySession.js";
import {
  BrowserFileAccess,
  parseDocument,
  serializeDocument,
  writeRecovery,
  type FileAccess,
} from "../io/persistence.js";
import { instanceSize, type LevelDocument } from "@mmx/content-schema";
import { BUILTIN_LEVELS } from "../levels/builtins.js";
import { el } from "../util/dom.js";
import type { EditorContext } from "./context.js";
import { Toolbar } from "./Toolbar.js";
import { LeftSidebar } from "./LeftSidebar.js";
import { Inspector } from "./Inspector.js";
import { BottomPanel } from "./BottomPanel.js";
import { attachShortcuts } from "./shortcuts.js";

/**
 * Wires the whole editor together: owns the {@link EditorStore}, the Pixi
 * viewport, and the Play session, and implements the {@link EditorContext} the
 * panels call into.
 */
export class Shell implements EditorContext {
  store: EditorStore;
  private viewport!: EditorViewport;
  private sidebar!: LeftSidebar;
  private play: PlaySession | null = null;
  private readonly fileAccess: FileAccess = new BrowserFileAccess();

  private centerHost = el("div", { class: "center" });
  private hint = el("div", { class: "viewport-hint" }, [
    "Scroll: zoom · Middle/Space-drag: pan · Del: remove",
  ]);
  private banner = el("div", { class: "play-banner" }, [
    "● Play mode — WASD/Arrows move · Space jump · X dash · C fire · Esc to stop",
  ]);
  private toastEl = el("div", { class: "toast" }, []);
  private toastTimer = 0;

  private savedView: { zoom: number; viewportPosition: { x: number; y: number } } | null = null;
  private savedSelection: string[] = [];

  private constructor(root: HTMLElement) {
    this.store = new EditorStore(BUILTIN_LEVELS[0].document());
    root.append(this.centerHost);
    this.banner.style.display = "none";
    this.centerHost.append(this.hint, this.banner, this.toastEl);
  }

  static async mount(root: HTMLElement): Promise<Shell> {
    const shell = new Shell(root);
    const toolbar = new Toolbar(shell);
    shell.sidebar = new LeftSidebar(shell);
    const inspector = new Inspector(shell);
    const bottom = new BottomPanel(shell);

    // CSS grid places each panel by its grid-area, so DOM order is irrelevant.
    root.append(toolbar.root, shell.sidebar.root, inspector.root, bottom.root);

    shell.viewport = await EditorViewport.create(shell.centerHost, shell.store);
    shell.store.subscribe((_, reason) => {
      shell.viewport.redraw();
      if (reason === "document" || reason === "open") writeRecovery(shell.store.get().document);
    });
    shell.viewport.fitToDocument();
    shell.viewport.redraw();

    attachShortcuts(shell);
    return shell;
  }

  // ---------- EditorContext ----------

  save(): void {
    const doc = this.store.get().document;
    void this.fileAccess.save(doc.id || doc.name || "level", serializeDocument(doc));
    this.store.markSaved();
    this.toast("Level saved to JSON download.");
  }

  async importJson(): Promise<void> {
    try {
      const opened = await this.fileAccess.open();
      if (!opened) return;
      const doc = parseDocument(opened.json);
      this.openDocument(doc, null);
      this.toast(`Imported ${opened.name}.`);
    } catch (error) {
      this.toast(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  openBuiltin(key: string): void {
    const level = BUILTIN_LEVELS.find((l) => l.key === key);
    if (!level) return;
    if (this.store.get().mode === "play") this.togglePlay();
    this.openDocument(level.document(), key);
  }

  private openDocument(doc: LevelDocument, levelKey: string | null): void {
    this.store.open(doc);
    this.sidebar.setActiveLevel(levelKey);
    this.viewport.fitToDocument();
    this.viewport.redraw();
  }

  undo(): void {
    this.store.undo();
  }
  redo(): void {
    this.store.redo();
  }

  zoomBy(factor: number): void {
    this.viewport.zoomByCentered(factor);
  }
  zoomReset(): void {
    this.viewport.zoomByCentered(2 / this.store.get().zoom);
  }
  fit(): void {
    this.viewport.fitToDocument();
  }

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
    this.viewport.centerOn(inst.x + width / 2, inst.y + height / 2);
  }

  togglePlay(): void {
    if (this.store.get().mode === "play") this.stopPlay();
    else void this.startPlay();
  }

  private async startPlay(): Promise<void> {
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
    this.viewport.setVisible(false);
    this.hint.style.display = "none";
    this.banner.style.display = "block";
    try {
      this.play = await PlaySession.start(this.centerHost, state.document, (message) => {
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
    this.viewport.setVisible(true);
    this.hint.style.display = "";
    this.banner.style.display = "none";
    // Restore the pre-play framing and selection; the document was never touched.
    if (this.savedView) this.store.setView(this.savedView.zoom, this.savedView.viewportPosition);
    this.store.select(this.savedSelection);
    this.viewport.redraw();
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add("show");
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove("show"), 2600);
  }
}
