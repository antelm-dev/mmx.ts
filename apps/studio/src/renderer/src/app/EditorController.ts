import {
  createLevelDocument,
  instanceSize,
  type LevelDocument,
  type ValidationResult,
} from "@mmx/content-schema";
import { decorationBounds } from "@mmx/renderer-pixi";
import {
  type ChangeReason,
  type EditorState,
  EditorStore,
} from "../core/EditorStore.js";
import {
  addImageLayer,
  addTileLayer,
  deleteSelection,
  duplicateSelection,
  nudgeSelection,
  placeAt,
  setTileAt,
} from "../core/actions.js";
import { EditorViewport } from "../core/EditorViewport.js";
import { tileGrid } from "../core/EditorViewportGeometry.js";
import { type PlaytestSnapshot } from "@mmx/editor-runtime";
import type { TilesetAsset } from "@mmx/project-schema";
import {
  createFileAccess,
  parseDocument,
  readRecovery,
  readRecoveryJson,
  serializeDocument,
  writeRecovery,
} from "../core/persistence.js";
import { useUiStore } from "../store/uiStore.js";
import { projectSession } from "../core/projectSession.js";
import type { GameDataOverlay } from "@mmx/engine/data";
import { addEnemy, type NewEnemyInput } from "../core/gameData.js";
import { duplicateEnemy } from "../core/enemyEditor.js";
import { buildStarterAssets } from "../assets/studioAssets.js";
import { EditorPlaytestController } from "./EditorPlaytestController.js";
import { dispatchEditorKey, undoScopeOf, type KeyboardContext, type UndoScope } from "./editorKeyboard.js";

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

  private readonly fileAccess = createFileAccess();
  private viewport: EditorViewport | null = null;
  private host: HTMLElement | null = null;

  private snapshot: EditorSnapshot;
  private readonly listeners = new Set<() => void>();

  private readonly playtest: EditorPlaytestController;
  private assetKey: string | undefined;
  /** The Play assets the last validation saw: their enemy sheets decide `enemy.animation`. */
  private validatedAssets: unknown = projectSession.loadedAssets();
  private readonly tilesetSizes = new Map<string, { path: string; w: number; h: number }>();
  private readonly tilesetSizeLoads = new Set<string>();

  constructor() {
    this.playtest = new EditorPlaytestController(this.store, {
      getHost: () => this.host,
      getFileAccess: () => this.fileAccess,
      getAssets: () => projectSession.getAssets(),
      getLoadoutId: () => projectSession.getSnapshot().project?.manifest.player?.loadout,
      getGameData: () => {
        const { compiled, issues } = projectSession.gameData();
        return issues.length > 0 ? null : compiled;
      },
      validate: () => this.validate(),
      toast: (msg) => this.toast(msg),
      focusObject: (id) => this.focusObject(id),
      onModeChange: (mode) => {
        if (mode === "play") {
          this.store.setMode("play");
        } else {
          this.store.setMode("edit");
          this.viewport?.setVisible(true);
          this.viewport?.redraw();
        }
      },
      setViewportVisible: (visible) => this.viewport?.setVisible(visible),
      restoreViewAndSelection: (zoom, viewportPosition, selection) => {
        this.store.setView(zoom, viewportPosition);
        this.store.setSelection(selection);
        this.viewport?.redraw();
      },
      togglePlaytestInspector: () => useUiStore.getState().togglePlaytestInspector(),
    });

    // Opening a project resets the sheet cache: nothing may still draw the old textures.
    projectSession.beforeSheetReset = () => {
      if (this.store.get().mode === "play") this.playtest.stopPlay();
      this.viewport?.releaseSheetTextures();
    };

    this.snapshot = this.build("open");
    this.store.subscribe((_, reason) => this.onStoreChange(reason));
    // Manifest edits (e.g. the player loadout) live in the project session, not the store.
    let rootPath = projectSession.getSnapshot().rootPath;
    projectSession.subscribe(() => {
      // Another project's enemies: the Enemy panel no longer edits the last one's.
      if (projectSession.getSnapshot().rootPath !== rootPath) {
        rootPath = projectSession.getSnapshot().rootPath;
        useUiStore.getState().setEnemyEditorId(null);
      }
      // Tile layers draw and paint from the manifest's tilesets; keep the store's copy current.
      const tilesets = this.tilesetAssets();
      const prev = this.store.get().tilesets;
      const ids = Object.keys(tilesets);
      if (ids.length !== Object.keys(prev).length || ids.some((id) => prev[id] !== tilesets[id])) {
        this.store.setTilesets(tilesets);
        this.loadTilesetSizes(tilesets);
      }
      // Image layers, asset properties and object instances are validated against the
      // manifest's assets and object definitions; recheck and redraw when they change.
      // Placed enemies are checked against the loaded Play assets: recheck when they land too.
      const assetKey = this.manifestAssetKey();
      const loaded = projectSession.loadedAssets();
      if (assetKey !== this.assetKey || loaded !== this.validatedAssets) {
        this.assetKey = assetKey;
        this.validatedAssets = loaded;
        this.viewport?.redraw();
        this.snapshot = this.build("ui");
        this.emit();
        return;
      }
      if (this.snapshot.dirty === this.isDirty) return;
      this.snapshot = { ...this.snapshot, dirty: this.isDirty };
      this.emit();
    });
    this.syncPageTitle(this.snapshot.levelTitle);
  }

  // ---------- React binding ----------

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = (): EditorSnapshot => this.snapshot;
  private emit(): void { for (const fn of this.listeners) fn(); }

  // ---------- Playtest React binding ----------

  subscribePlaytest = (fn: () => void): (() => void) => this.playtest.subscribe(fn);
  getPlaytestSnapshot = (): PlaytestSnapshot => this.playtest.getSnapshot();

  /** The open project's `image` asset ids; undefined without a project (no cross-check). */
  private imageAssetIds(): string[] | undefined {
    return projectSession
      .getSnapshot()
      .project?.manifest.assets.filter((asset) => asset.kind === "image")
      .map((asset) => asset.id);
  }

  /** Identity of the manifest's asset ids and kinds, its object definitions and game data; undefined without a project. */
  private manifestAssetKey(): string | undefined {
    const project = projectSession.getSnapshot().project;
    if (!project) return undefined;
    const { manifest } = project;
    const assets = manifest.assets.map((asset) => `${asset.id}:${asset.kind}`).join(",");
    return `${assets}|${JSON.stringify(manifest.objects ?? [])}|${JSON.stringify(project.gameData ?? null)}`;
  }

  /** The open project's `tileset` assets by id; empty without a project. */
  private tilesetAssets(): Record<string, TilesetAsset> {
    const assets = projectSession.getSnapshot().project?.manifest.assets ?? [];
    return Object.fromEntries(
      assets.filter((a): a is TilesetAsset => a.kind === "tileset").map((a) => [a.id, a]),
    );
  }

  private validate(): ValidationResult {
    const imageAssetIds = this.imageAssetIds();
    // Tile counts follow the current tile size; undefined until the image size is known.
    const tilesets = imageAssetIds
      ? new Map(
          Object.values(this.tilesetAssets()).map((t) => {
            const size = this.tilesetSizes.get(t.id);
            if (size?.path !== t.path) return [t.id, undefined];
            const { columns, rows } = tileGrid(t, size);
            return [t.id, columns * rows];
          }),
        )
      : undefined;
    const assets = projectSession.getSnapshot().project?.manifest.assets;
    const enemyActors = projectSession.loadedAssets()?.manifest.enemyActors;
    return this.store.validate(
      imageAssetIds,
      tilesets,
      assets && new Map(assets.map((asset) => [asset.id, asset.kind])),
      projectSession.gameData().compiled,
      enemyActors && new Set(Object.keys(enemyActors)),
    );
  }

  /** Read each tileset image's pixel size once per file, then revalidate with real tile counts. */
  private loadTilesetSizes(tilesets: Record<string, TilesetAsset>): void {
    for (const t of Object.values(tilesets)) {
      const key = `${t.id}|${t.path}`;
      if (this.tilesetSizes.get(t.id)?.path === t.path || this.tilesetSizeLoads.has(key)) continue;
      this.tilesetSizeLoads.add(key);
      void projectSession
        .getAssets()
        .then((assets) => {
          const url = assets?.resolveUrl(t);
          if (!url) return;
          const img = new Image();
          img.onload = () => {
            this.tilesetSizes.set(t.id, { path: t.path, w: img.naturalWidth, h: img.naturalHeight });
            this.snapshot = this.build("ui");
            this.emit();
          };
          img.src = url;
        })
        .catch(() => undefined)
        .finally(() => this.tilesetSizeLoads.delete(key));
    }
  }

  private get isDirty(): boolean {
    return this.store.isDirty || projectSession.getSnapshot().dirty === true;
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
      dirty: keepDerived ? prev.dirty : this.isDirty,
      validation: keepDerived ? prev.validation : this.validate(),
      levelTitle: this.computeTitle(),
    };
  }

  private onStoreChange(reason: ChangeReason): void {
    this.viewport?.redraw();
    if (reason === "document" || reason === "open") {
      writeRecovery(this.store.get().document);
      const project = projectSession.getSnapshot().project;
      if (project) {
        const levelId = project.manifest.entryLevelId;
        projectSession.syncLevel(levelId, this.store.get().document);
      }
    }
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

  /** Point the viewport at the current project's sprites (starter when none or invalid). */
  private async applyProjectAssets(): Promise<void> {
    // A fresh starter: the bundled one's catalog was loaded before the last sheet reset.
    const assets = (await projectSession.getAssets()) ?? buildStarterAssets();
    try {
      await this.viewport?.setAssets(assets.catalog);
    } catch (error) {
      this.toast(`Could not load sprites: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Import a PNG into the open project as an image (or tileset) and add a layer that shows it. */
  async importImageLayer(kind: "image" | "tileset" = "image"): Promise<void> {
    if (!projectSession.getSnapshot().open) {
      this.toast(`Open a project before importing ${kind === "image" ? "an image" : "a tileset"}.`);
      return;
    }
    try {
      const assetId = await projectSession.importImage(kind);
      if (!assetId) return;
      await this.applyProjectAssets();
      if (kind === "image") addImageLayer(this.store, assetId);
      else addTileLayer(this.store, assetId);
    } catch (error) {
      this.toast(`Import failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  detachViewport(): void {
    this.viewport?.destroy();
    this.viewport = null;
    this.host = null;
  }
  closeEmptyContextMenu(): void { useUiStore.getState().setContextMenu(null); }

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

  save(): void { void this.saveAsync(); }

  private async saveAsync(): Promise<void> {
    const doc = this.store.get().document;
    const projectState = projectSession.getSnapshot();
    if (projectState.open && projectState.project) {
      projectSession.syncLevel(projectState.project.manifest.entryLevelId, doc);
      const issues = await projectSession.saveProject();
      if (issues.some((issue) => issue.severity === "error")) {
        this.toast(`Project save failed: ${issues[0]?.message ?? "validation error"}`);
        return;
      }
      this.store.markSaved();
      this.toast("Project saved.");
      return;
    }

    const ok = await this.fileAccess.save(doc.id || doc.name || "level", serializeDocument(doc));
    if (!ok) return;
    this.store.markSaved();
    this.toast("Level saved.");
  }

  async createProject(): Promise<void> {
    if (!this.confirmDiscardIfDirty("Create a new project?")) return;
    if (this.store.get().mode === "play") this.togglePlay();
    const issues = await projectSession.createProject();
    void this.applyProjectAssets();
    if (issues.some((issue) => issue.severity === "error")) {
      this.toast(`Create project failed: ${issues[0]?.message ?? "validation error"}`);
      return;
    }
    const entry = projectSession.getEntryLevelDocument();
    if (!entry) {
      this.toast("Project created but no entry level was found.");
      return;
    }
    this.openDocument(entry);
    this.toast(`Project '${projectSession.getSnapshot().project?.manifest.name ?? ""}' created.`);
  }

  async createFromStarter(): Promise<void> {
    if (!this.confirmDiscardIfDirty("Create a new project from the MMX starter template?")) return;
    if (this.store.get().mode === "play") this.togglePlay();
    const issues = await projectSession.createFromStarter();
    void this.applyProjectAssets();
    if (issues.some((issue) => issue.severity === "error")) {
      this.toast(`Create starter project failed: ${issues[0]?.message ?? "validation error"}`);
      return;
    }
    const entry = projectSession.getEntryLevelDocument();
    if (!entry) {
      this.toast("Starter project created but no entry level was found.");
      return;
    }
    this.openDocument(entry);
    this.toast(
      `MMX starter project '${projectSession.getSnapshot().project?.manifest.name ?? ""}' created.`,
    );
  }

  async openProject(): Promise<void> {
    if (!this.confirmDiscardIfDirty("Open another project?")) return;
    if (this.store.get().mode === "play") this.togglePlay();
    const issues = await projectSession.openProject();
    void this.applyProjectAssets();
    if (issues.some((issue) => issue.severity === "error")) {
      this.toast(`Open project failed: ${issues[0]?.message ?? "validation error"}`);
      return;
    }
    const entry = projectSession.getEntryLevelDocument();
    if (!entry) {
      this.toast("Project opened but no entry level was found.");
      return;
    }
    this.openDocument(entry);
    this.toast(`Opened project '${projectSession.getSnapshot().project?.manifest.name ?? ""}'.`);
  }

  async importFromSteam(): Promise<void> {
    if (!this.confirmDiscardIfDirty("Import a project from your Steam installs?")) return;
    if (this.store.get().mode === "play") this.togglePlay();
    const issues = await projectSession.importFromSteam((step) => this.toast(`Import: ${step}…`));
    if (issues.some((issue) => issue.severity === "error")) {
      this.toast(`Import failed: ${issues[0]?.message ?? "validation error"}`);
      return;
    }
    void this.applyProjectAssets();
    const entry = projectSession.getEntryLevelDocument();
    if (!entry) {
      this.toast("Imported, but no entry level was found.");
      return;
    }
    this.openDocument(entry);
    this.toast(`Imported project '${projectSession.getSnapshot().project?.manifest.name ?? ""}'.`);
  }

  async exportProject(): Promise<void> {
    const issues = await projectSession.exportProject();
    if (issues.some((issue) => issue.severity === "error")) {
      this.toast(`Export failed: ${issues[0]?.message ?? "validation error"}`);
      return;
    }
    this.toast("Project exported.");
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
    if (!this.isDirty) return true;
    return window.confirm(`${action}\n\nUnsaved changes will be lost.`);
  }

  private openDocument(doc: LevelDocument): void {
    this.store.open(doc);
    this.syncPageTitle(this.computeTitle());
    this.viewport?.fitToDocument();
    this.viewport?.redraw();
  }

  private syncPageTitle(title: string): void { document.title = `${title} · MMX Studio`; }

  // ---------- History ----------

  /** Where Ctrl+Z/Ctrl+Y go: the surface last clicked or focused (a blurred field leaves it unchanged). */
  private undoScope: UndoScope = "level";
  noteUndoScope(target: EventTarget | null): void { this.undoScope = undoScopeOf(target); }

  /**
   * Undo a level edit, or (scope "definitions") a project object or game-data edit.
   * The latter says so in a toast: after a palette click, Ctrl+Z is not the placement's.
   */
  undo(scope: UndoScope = "level"): void {
    if (scope === "level") this.store.undo();
    else this.stepDefinitions(projectSession.undoDefinitions(), "Undid object edit.", "No object edit to undo.");
  }
  redo(scope: UndoScope = "level"): void {
    if (scope === "level") this.store.redo();
    else this.stepDefinitions(projectSession.redoDefinitions(), "Redid object edit.", "No object edit to redo.");
  }
  private stepDefinitions(done: boolean, doneMessage: string, noneMessage: string): void {
    this.toast(done ? doneMessage : noneMessage);
    if (done) void this.applyProjectAssets();
  }

  // ---------- View ----------

  zoomBy(factor: number): void { this.viewport?.zoomByCentered(factor); }
  zoomIn(): void { this.zoomBy(ZOOM_STEP); }
  zoomOut(): void { this.zoomBy(1 / ZOOM_STEP); }
  setZoom(zoom: number): void {
    const current = this.store.get().zoom;
    if (current <= 0 || current === zoom) return;
    this.zoomBy(zoom / current);
  }
  fit(): void { this.viewport?.fitToDocument(); }
  toggleGrid(): void { this.store.toggleGrid(); }
  toggleSnap(): void { this.store.toggleSnap(); }

  // ---------- Objects ----------

  duplicateSelection(): void { duplicateSelection(this.store); }
  deleteSelection(): void { deleteSelection(this.store); }

  /** Add a project enemy (data/game.json) and pick it for placing; saved with the project. */
  createEnemy(input: NewEnemyInput): void {
    const project = projectSession.getSnapshot().project;
    if (!project) return;
    const { overlay, id } = addEnemy(project.gameData, projectSession.gameData().data, input);
    this.setGameData(overlay);
    this.store.setTool("place", id);
  }

  /** Replace the project's data/game.json records; saved with the project. */
  setGameData(overlay: GameDataOverlay): void {
    projectSession.setGameData(overlay);
    // The viewport draws project enemies from the rebuilt sprites.
    void this.applyProjectAssets();
  }

  /** Copy an enemy (displayed as `name`) into the project under a new id and open the copy in the enemy editor. */
  duplicateEnemy(enemyId: string, name: string): void {
    const project = projectSession.getSnapshot().project;
    if (!project) return;
    const { overlay, id } = duplicateEnemy(project.gameData, projectSession.gameData().data, enemyId, name);
    this.setGameData(overlay);
    useUiStore.getState().setEnemyEditorId(id);
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
    if (this.store.get().document.objects.some((o) => o.id === id))
      this.store.toggleObjectInSelection(id);
  }
  toggleDecorationSelection(id: string): void {
    if (this.store.get().document.decorations.some((d) => d.id === id))
      this.store.toggleDecorationInSelection(id);
  }

  // ---------- Play ----------

  togglePlay(): void { this.playtest.togglePlay(); }

  // ---------- Playtest debugger commands ----------

  playtestTogglePause(): void { this.playtest.togglePause(); }
  playtestStep(): void { this.playtest.step(); }
  playtestSetCheckpoint(): void { this.playtest.setCheckpoint(); }
  playtestRestartCheckpoint(): void { this.playtest.restartCheckpoint(); }
  playtestRestartLevel(): void { this.playtest.restartLevel(); }
  playtestSeek(frame: number): void { this.playtest.seek(frame); }
  playtestNudgeTimeScale(delta: number): void { this.playtest.nudgeTimeScale(delta); }
  playtestSetInvulnerable(enabled: boolean): void { this.playtest.setInvulnerable(enabled); }
  playtestSaveReplay(): void { this.playtest.saveReplay(); }
  playtestLoadReplay(): void { this.playtest.loadReplay(); }
  playtestCopyDiagnostics(): void { this.playtest.copyDiagnostics(); }
  playtestSelect(runtimeId: string | null): void { this.playtest.select(runtimeId); }
  playtestFocusSource(): void { this.playtest.focusSelectedSource(); }

  // ---------- Keyboard ----------

  handleKeydown(e: KeyboardEvent): void {
    const state = this.store.get();
    const uiState = useUiStore.getState();
    const target = e.target as HTMLElement | null;
    const isTypingField = !!(target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName));

    const ctx: KeyboardContext = {
      mode: state.mode,
      activeTool: state.activeTool,
      isTypingField,
      isFullscreen: uiState.fullscreen,
      hasContextMenu: !!uiState.contextMenu,
      invulnerable: this.playtest.getSnapshot().debug.invulnerable,
      undoScope: this.undoScope,
    };

    const cmd = dispatchEditorKey(e, ctx, state.document.gridSize);
    if (!cmd) return;
    e.preventDefault();

    switch (cmd.kind) {
      case "undo": this.undo(cmd.scope); break;
      case "redo": this.redo(cmd.scope); break;
      case "save": this.save(); break;
      case "newLevel": this.newLevel(); break;
      case "openLevel": void this.openLevel(); break;
      case "zoomIn": this.zoomIn(); break;
      case "zoomOut": this.zoomOut(); break;
      case "zoomReset": this.setZoom(1); break;
      case "duplicate": this.duplicateSelection(); break;
      case "delete": this.deleteSelection(); break;
      case "fit": this.fit(); break;
      case "toggleGrid": this.toggleGrid(); break;
      case "toggleSnap": this.toggleSnap(); break;
      case "toolSelect": this.store.setTool("select"); break;
      case "toolTile": this.toggleTileTool(); break;
      case "escapeTool":
        if (
          state.activeTool === "place" ||
          state.activeTool === "placeDecoration" ||
          state.activeTool === "tile" ||
          state.activeTool === "tilePaint"
        )
          this.store.setTool("select");
        else this.store.clearSelection();
        break;
      case "closeContextMenu": this.closeEmptyContextMenu(); break;
      case "exitFullscreen": void window.studio?.window.toggleFullscreen(); break;
      case "nudge": nudgeSelection(this.store, cmd.dx, cmd.dy); break;
      case "togglePlay": this.togglePlay(); break;
      case "playtestExit": this.playtest.stopPlay(); break;
      case "playtestTogglePause": this.playtestTogglePause(); break;
      case "playtestSetCheckpoint": this.playtestSetCheckpoint(); break;
      case "playtestRestartCheckpoint": this.playtestRestartCheckpoint(); break;
      case "playtestStep": this.playtestStep(); break;
      case "playtestToggleInspector": uiState.togglePlaytestInspector(); break;
      case "playtestNudgeTimeScale": this.playtestNudgeTimeScale(cmd.delta); break;
      case "playtestSetInvulnerable": this.playtestSetInvulnerable(cmd.enabled); break;
      case "playtestCopyDiagnostics": this.playtestCopyDiagnostics(); break;
      case "playtestSaveReplay": this.playtestSaveReplay(); break;
      case "playtestLoadReplay": this.playtestLoadReplay(); break;
    }
  }

  toast(message: string): void {
    useUiStore.getState().addToast(message);
  }
}

/** The one editor instance the whole renderer shares. */
export const editor = new EditorController();
