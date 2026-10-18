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
  type LayerKey,
} from "../core/EditorStore.js";
import {
  addImageLayer,
  addTileLayer,
  deleteSelection,
  duplicateSelection,
  nudgeSelection,
  placeAt,
  setRoomSettings,
  setTileAt,
} from "../core/actions.js";
import { copySelection, cutSelection, pasteClipboard } from "../core/clipboard.js";
import { EditorViewport } from "../core/EditorViewport.js";
import { tileGrid } from "../core/EditorViewportGeometry.js";
import { problemTarget } from "../core/problemAnchors.js";
import type { PositionedIssue } from "@mmx/editor-runtime/adapters";
import { type PlaytestSnapshot } from "@mmx/editor-runtime";
import type { TilesetAsset } from "@mmx/project-schema";
import {
  clearRecovery,
  createFileAccess,
  parseDocument,
  readRecovery,
  serializeDocument,
  writeRecovery,
} from "../core/persistence.js";
import { useUiStore } from "../store/uiStore.js";
import { projectSession, recoveredLevelName } from "../core/projectSession.js";
import type { ProjectIssue, StudioProject } from "@mmx/project-io";
import { addRecentProject } from "../settings/recentProjects.js";
import type { GameDataOverlay } from "@mmx/engine/data";
import { addEnemy, type NewEnemyInput } from "../core/gameData.js";
import { addBlankEnemy, duplicateEnemy, type BlankEnemyInput } from "../core/enemyEditor.js";
import { availableParts, trackRecentParts, type RecentPart } from "../core/recentParts.js";
import { buildStarterAssets } from "../assets/studioAssets.js";
import { EditorPlaytestController } from "./EditorPlaytestController.js";
import { focusPanel, isPanelVisible, openEnemyDocument } from "./dock.js";
import {
  dispatchEditorKey,
  undoScopeOf,
  type KeyboardContext,
  type UndoScope,
} from "./editorKeyboard.js";

const ZOOM_STEP = 1.2;

/** Outcome of a project command; `error` is set when it failed rather than being cancelled. */
export interface ProjectOpenResult {
  opened: boolean;
  error?: string;
}

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
  /** Picks a recent part without reordering the bar (see {@link trackRecentParts}). */
  private readonly pickFromBar: (part: RecentPart) => void;
  private assetKey: string | undefined;
  /** The Play assets the last validation saw: their enemy sheets decide `enemy.animation`. */
  private validatedAssets: unknown = projectSession.loadedAssets();
  private readonly tilesetSizes = new Map<string, { path: string; w: number; h: number }>();
  private readonly tilesetSizeLoads = new Set<string>();
  /** A recovery draft that differs from the shown document exists; checked on open, not per render. */
  private recoveryOffered = false;
  /** The stored draft is this session's own edit, so a save may clear it (never a crash draft). */
  private draftWritten = false;
  private ensuring: Promise<boolean> | null = null;

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

    this.recoveryOffered = this.draftDiffersFromDocument();
    this.snapshot = this.build("open");
    this.store.subscribe((_, reason) => this.onStoreChange(reason));
    this.pickFromBar = trackRecentParts(this.store, (part) =>
      useUiStore.getState().addRecentPart(part),
    );
    // Manifest edits (e.g. the player loadout) live in the project session, not the store.
    projectSession.subscribe(() => {
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
    // A draft of a work project left from an earlier run is offered with it on the Start tab.
    void projectSession.listWorkProjects().then(() => {
      if (!this.recoveryOffered || this.draftDiffersFromDocument()) return;
      this.recoveryOffered = false;
      this.snapshot = this.build("ui");
      this.emit();
    });
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
            this.tilesetSizes.set(t.id, {
              path: t.path,
              w: img.naturalWidth,
              h: img.naturalHeight,
            });
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
      // Only an edit writes the draft: opening a level must not overwrite a crash draft.
      if (
        reason === "document" &&
        writeRecovery(this.store.get().document, projectSession.getSnapshot().rootPath)
      ) {
        this.draftWritten = true;
      }
      const { currentLevelId } = projectSession.getSnapshot();
      if (currentLevelId) projectSession.syncLevel(currentLevelId, this.store.get().document);
      // After the sync: a restored draft now matches its level and is not offered again.
      this.recoveryOffered = reason === "open" && this.draftDiffersFromDocument();
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
      this.toast(
        `Could not load sprites: ${error instanceof Error ? error.message : String(error)}`,
      );
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

  /**
   * Start a fresh, blank level with a floor and a single Spawn; false if the user kept their
   * edits. With a project open, the level is added to it instead (nothing is discarded).
   */
  newLevel(): boolean {
    const project = projectSession.getSnapshot().project;
    if (project) {
      const id = projectSession.addLevel(`Level ${project.levels.length + 1}`);
      if (id) this.openProjectLevel(id);
      this.toast("Level added to the project.");
      return true;
    }
    if (!this.confirmDiscardIfDirty("Create a new level?")) return false;
    if (this.store.get().mode === "play") this.togglePlay();
    this.openDocument(createLevelDocument());
    this.toast("New level created.");
    return true;
  }

  save(): void {
    void this.saveAsync();
  }

  private async saveAsync(): Promise<void> {
    const doc = this.store.get().document;
    const projectState = projectSession.getSnapshot();
    if (projectState.untitled) {
      // The first Save asks for a name, then a folder (saveUntitledProject).
      useUiStore.getState().setSaveProjectOpen(true);
      return;
    }
    if (projectState.open && projectState.project) {
      if (projectState.currentLevelId) projectSession.syncLevel(projectState.currentLevelId, doc);
      const issues = await projectSession.saveProject();
      if (issues.some((issue) => issue.severity === "error")) {
        this.toast(`Project save failed: ${issues[0]?.message ?? "validation error"}`);
        return;
      }
      this.dropRecovery();
      this.store.markSaved();
      // A Save that seeded game/data.json reloaded the sprites (projectSession.saveProject).
      void this.applyProjectAssets();
      this.toast("Project saved.");
      return;
    }

    const ok = await this.fileAccess.save(doc.id || doc.name || "level", serializeDocument(doc));
    if (!ok) return;
    this.dropRecovery();
    this.store.markSaved();
    this.toast("Level saved.");
  }

  /**
   * Save an untitled project as `name` in a folder the user picks, moving it out of the work
   * folder; it then opens from Recent like any project. Cancelling the picker changes nothing.
   */
  async saveUntitledProject(name: string): Promise<void> {
    const before = projectSession.getSnapshot();
    if (!before.untitled || !before.rootPath) return;
    const workRoot = before.rootPath;
    if (before.currentLevelId) {
      projectSession.syncLevel(before.currentLevelId, this.store.get().document);
    }
    const issues = await projectSession.saveUntitled(name.trim());
    if (!issues) return;
    const error = issues.find((issue) => issue.severity === "error");
    if (error) {
      // Only the move reports `work-project.*`: the save to the work folder went through.
      this.toast(
        error.code.startsWith("work-project.")
          ? `Project saved among the unsaved projects but could not be moved: ${error.message}`
          : `Project save failed: ${error.message}`,
      );
      return;
    }
    const { rootPath, project, untitled } = projectSession.getSnapshot();
    if (untitled || !rootPath || !project || rootPath === workRoot) return;
    const draft = readRecovery();
    if (draft?.rootPath === workRoot) {
      // Save wrote every level: the draft is redundant, unless its level is not in the project,
      // then it follows the project and stays offered as a "(recovered)" level.
      if (project.levels.some((level) => level.id === draft.document.id)) clearRecovery();
      else writeRecovery(draft.document, rootPath);
    }
    this.draftWritten = false;
    this.recoveryOffered = this.draftDiffersFromDocument();
    this.store.markSaved();
    addRecentProject({ rootPath, name: project.manifest.name });
    void this.applyProjectAssets();
    const warning = issues.find((issue) => issue.code === "work-project.cleanup");
    this.toast(warning ? `Project saved. ${warning.message}` : "Project saved.");
  }

  /**
   * Contract C-WORK: make sure a project is open. Without one, the current level becomes the
   * entry level of a new untitled project in Studio's work folder (no confirmation, nothing
   * discarded, not a recent project). False, with a toast, when it could not be created.
   */
  ensureProject(): Promise<boolean> {
    if (projectSession.getSnapshot().open) return Promise.resolve(true);
    // One work project for calls made while it is being created.
    this.ensuring ??= this.createWorkProject().finally(() => (this.ensuring = null));
    return this.ensuring;
  }

  /**
   * AC-NOPROJECT: run a creation that needs a project (New object…, Import sprite sheet…, New
   * animation…), making the untitled work project first when none is open. Nothing runs when that
   * fails, and a toast says why.
   */
  async withProject(create: () => unknown): Promise<void> {
    let ready = false;
    try {
      ready = await this.ensureProject();
    } catch (error) {
      this.toast(
        `Could not create a project: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (ready) await create();
  }

  private async createWorkProject(): Promise<boolean> {
    if (this.store.get().mode === "play") this.togglePlay();
    const issues = await projectSession.createWorkProject(this.store.get().document);
    const error = issues.find((issue) => issue.severity === "error");
    if (error || !projectSession.getSnapshot().open) {
      this.toast(`Could not create a project: ${error?.message ?? "unknown error"}`);
      return false;
    }
    void this.applyProjectAssets();
    // This session's draft of the level is in the work folder now: not offered back.
    this.dropRecovery();
    const entry = projectSession.getCurrentLevelDocument();
    if (entry) {
      // shortcut: store.open restarts the undo history (the level's id becomes the entry's) and resets the
      // selection, tool, placing ids, layer visibility/lock and the Play trail; keep them if users miss it.
      this.store.open(entry);
      this.syncPageTitle(this.computeTitle());
    }
    return true;
  }

  /** Start tab: reopen a work project left from an earlier run, with its newer recovery draft. */
  async restoreWorkProject(rootPath: string): Promise<ProjectOpenResult> {
    if (!this.confirmDiscardIfDirty("Restore an unsaved project?")) return { opened: false };
    if (this.store.get().mode === "play") this.togglePlay();
    const before = projectSession.getSnapshot().project;
    const issues = await projectSession.openProject(rootPath, true);
    void this.applyProjectAssets();
    const result = this.enterProject(
      before,
      issues,
      {
        failed: "Restore failed",
        opened: () => "Unsaved project restored.",
        noEntry: "Unsaved project restored but no entry level was found.",
      },
      false,
    );
    // Level edits made after the work folder was written are in the draft: put them back.
    const draft = readRecovery();
    if (result.opened && draft?.rootPath === rootPath && projectSession.recoveryTarget(draft)) {
      if (this.draftDiffersFromDocument()) this.openDocument(projectSession.recoverLevel(draft)!);
    }
    return result;
  }

  /** Start tab: delete a work project for good, and its recovery draft. */
  async deleteWorkProject(rootPath: string): Promise<void> {
    const issues = await projectSession.deleteWorkProject(rootPath);
    const error = issues.find((issue) => issue.severity === "error");
    if (error) {
      this.toast(`Delete failed: ${error.message}`);
      return;
    }
    if (readRecovery()?.rootPath === rootPath) clearRecovery();
    this.toast("Unsaved project deleted.");
  }

  async createProject(): Promise<ProjectOpenResult> {
    if (!this.confirmDiscardIfDirty("Create a new project?")) return { opened: false };
    if (this.store.get().mode === "play") this.togglePlay();
    const before = projectSession.getSnapshot().project;
    const issues = await projectSession.createProject();
    void this.applyProjectAssets();
    return this.enterProject(before, issues, {
      failed: "Create project failed",
      opened: (name) => `Project '${name}' created.`,
      noEntry: "Project created but no entry level was found.",
    });
  }

  async createFromStarter(): Promise<ProjectOpenResult> {
    if (!this.confirmDiscardIfDirty("Create a new project from the MMX starter template?")) {
      return { opened: false };
    }
    if (this.store.get().mode === "play") this.togglePlay();
    const before = projectSession.getSnapshot().project;
    const issues = await projectSession.createFromStarter();
    void this.applyProjectAssets();
    return this.enterProject(before, issues, {
      failed: "Create starter project failed",
      opened: (name) => `MMX starter project '${name}' created.`,
      noEntry: "Starter project created but no entry level was found.",
    });
  }

  /** Open the project at `rootPath`, or at a folder the user picks. */
  async openProject(rootPath?: string): Promise<ProjectOpenResult> {
    if (!this.confirmDiscardIfDirty("Open another project?")) return { opened: false };
    if (this.store.get().mode === "play") this.togglePlay();
    const before = projectSession.getSnapshot().project;
    const issues = await projectSession.openProject(rootPath);
    void this.applyProjectAssets();
    return this.enterProject(before, issues, {
      failed: "Open project failed",
      opened: (name) => `Opened project '${name}'.`,
      noEntry: "Project opened but no entry level was found.",
    });
  }

  /** Start page: reopen a recent project, with the same unsaved-changes guard. */
  openRecentProject(rootPath: string): Promise<ProjectOpenResult> {
    return this.openProject(rootPath);
  }

  async importFromSteam(): Promise<ProjectOpenResult> {
    if (!this.confirmDiscardIfDirty("Import a project from your Steam installs?")) {
      return { opened: false };
    }
    if (this.store.get().mode === "play") this.togglePlay();
    const before = projectSession.getSnapshot().project;
    const issues = await projectSession.importFromSteam((step) => this.toast(`Import: ${step}…`));
    if (!issues.some((issue) => issue.severity === "error")) void this.applyProjectAssets();
    return this.enterProject(before, issues, {
      failed: "Import failed",
      opened: (name) => `Imported project '${name}'.`,
      noEntry: "Imported, but no entry level was found.",
    });
  }

  /**
   * Shared tail of the project commands: report a failure, or remember the project as recent
   * and show its entry level. The same project object as `before` means the picker was cancelled.
   */
  private enterProject(
    before: StudioProject | null,
    issues: ProjectIssue[],
    messages: { failed: string; opened: (name: string) => string; noEntry: string },
    recent = true,
  ): ProjectOpenResult {
    const error = issues.find((issue) => issue.severity === "error");
    if (error) {
      this.toast(`${messages.failed}: ${error.message}`);
      return { opened: false, error: error.message };
    }
    const { rootPath, project } = projectSession.getSnapshot();
    if (project === before || !rootPath || !project) return { opened: false };
    if (recent) addRecentProject({ rootPath, name: project.manifest.name });
    const entry = projectSession.getCurrentLevelDocument();
    if (!entry) {
      this.toast(messages.noEntry);
      return { opened: true };
    }
    this.openDocument(entry);
    this.toast(messages.opened(project.manifest.name));
    return { opened: true };
  }

  async exportProject(): Promise<void> {
    const issues = await projectSession.exportProject();
    if (issues.some((issue) => issue.severity === "error")) {
      this.toast(`Export failed: ${issues[0]?.message ?? "validation error"}`);
      return;
    }
    this.toast("Project exported.");
  }

  /**
   * File → Install / update MMX Starter pack… (contract C-INSTALL), for a saved project only (the
   * menu item is disabled with unsaved changes, which the reopen would drop). Shows what would be
   * added and kept and changes nothing until confirmed; then writes into the project folder,
   * reopens the project (the undo history restarts) and shows what was added and kept.
   */
  async installStarterPack(): Promise<void> {
    const { rootPath, project } = projectSession.getSnapshot();
    if (!rootPath || !project || this.isDirty) return;
    const preview = await projectSession.installPack(true);
    if (!preview.ok) {
      this.toast(`Install failed: ${preview.issues[0]?.message ?? "unknown error"}`);
      return;
    }
    if (preview.value.added.length === 0) {
      window.alert(
        packSummary("The MMX Starter pack is up to date: nothing to add.", preview.value),
      );
      return;
    }
    const question = packSummary("Install / update the MMX Starter pack?", preview.value);
    const undo =
      "The project folder is changed now, and Undo cannot revert it. Nothing is replaced: " +
      "to go back, remove what is added (or restore the folder from a backup).";
    if (!window.confirm(`${question}\n\n${undo}`)) return;
    if (this.store.get().mode === "play") this.togglePlay();
    const installed = await projectSession.installPack(false);
    if (!installed.ok) {
      this.toast(`Install failed: ${installed.issues[0]?.message ?? "unknown error"}`);
      return;
    }
    const issues = await projectSession.openProject(rootPath);
    void this.applyProjectAssets();
    const reopened = this.enterProject(project, issues, {
      failed: "Reopen failed",
      opened: () => "MMX Starter pack installed.",
      noEntry: "MMX Starter pack installed but no entry level was found.",
    });
    if (reopened.opened) window.alert(packSummary("MMX Starter pack installed.", installed.value));
  }

  /** Open a level JSON file; with a project open, it is imported as a new level of the project. */
  async openLevel(): Promise<void> {
    const inProject = projectSession.getSnapshot().open;
    if (!inProject && !this.confirmDiscardIfDirty("Open another level?")) return;
    try {
      const opened = await this.fileAccess.open();
      if (!opened) return;
      if (inProject) {
        const doc = parseDocument(opened.json);
        const id = projectSession.addLevel(doc.name || opened.name.replace(/\.json$/i, ""), doc);
        if (id) this.openProjectLevel(id);
        this.toast(`Added ${opened.name} to the project.`);
        return;
      }
      if (this.store.get().mode === "play") this.togglePlay();
      this.openDocument(parseDocument(opened.json));
      this.toast(`Opened ${opened.name}.`);
    } catch (error) {
      this.toast(`Open failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ---------- Project levels (contract C-LEVEL) ----------

  /**
   * Show another level of the open project. The store's edits are synced into the project on
   * every change, so the level left keeps them, unsaved, until Save writes every level.
   */
  openProjectLevel(id: string): void {
    const { project, currentLevelId } = projectSession.getSnapshot();
    const level = project?.levels.find((entry) => entry.id === id);
    if (!level) return;
    focusPanel("viewport");
    if (id === currentLevelId) return;
    if (this.store.get().mode === "play") this.togglePlay();
    projectSession.setCurrentLevel(id);
    // shortcut: the undo history restarts on each switch; keep one per level if users miss it.
    this.openDocument(level.document);
  }

  /** Rename a project level; the shown one through the store, so undo and sync stay in step. */
  renameProjectLevel(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (id !== projectSession.getSnapshot().currentLevelId) {
      projectSession.renameLevel(id, trimmed);
      return;
    }
    const doc = this.store.get().document;
    if (doc.name === trimmed) return;
    const { gridSize, cols, rows } = doc;
    this.store.execute(setRoomSettings(doc, { name: trimmed, gridSize, cols, rows }));
  }

  /** Remove a level from the project (not the entry or the last one), leaving it first if shown. */
  deleteProjectLevel(id: string): void {
    const { project, currentLevelId } = projectSession.getSnapshot();
    if (!project || id === project.manifest.entryLevelId) return;
    if (id === currentLevelId) this.openProjectLevel(project.manifest.entryLevelId);
    if (projectSession.deleteLevel(id)) this.toast("Level removed from the project.");
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
    return this.recoveryOffered;
  }

  /** A draft equal to the level it would restore over (or the shown one) is not offered. */
  private draftDiffersFromDocument(): boolean {
    const draft = readRecovery();
    if (!draft) return false;
    // Restored with its work project from the Start tab, not on its own.
    const { rootPath } = draft;
    if (projectSession.leftoverWorkProjects().some((entry) => entry.rootPath === rootPath)) {
      return false;
    }
    const current = projectSession.recoveryTarget(draft) ?? this.store.get().document;
    return serializeDocument(draft.document) !== serializeDocument(current);
  }

  /** Saved: this session's draft goes, so one only exists while there are unsaved edits. */
  private dropRecovery(): void {
    if (!this.draftWritten) return;
    clearRecovery();
    this.draftWritten = false;
    this.recoveryOffered = false;
  }

  /**
   * Open the recovery draft: in a project, over the level it was saved from only when it comes
   * from this project, otherwise as a new level; without a project, as the current document.
   */
  restoreRecovery(): void {
    const draft = readRecovery();
    if (!draft) {
      this.toast("No readable recovery draft found.");
      return;
    }
    const inProject = projectSession.getSnapshot().project != null;
    const target = projectSession.recoveryTarget(draft);
    const added = recoveredLevelName(draft.document);
    const confirmed = !inProject
      ? this.confirmDiscardIfDirty("Replace the current document with the recovery draft?")
      : target
        ? window.confirm(
            `Replace level "${target.name}" with the recovery draft?\n\nIts current content and unsaved changes will be lost.`,
          )
        : window.confirm(
            `Add the recovery draft as a new level, "${added}"?\n\nNo existing level is replaced.`,
          );
    if (!confirmed) return;
    if (this.store.get().mode === "play") this.togglePlay();
    // In a project: into the level the draft came from (or a new one), never the shown slot.
    this.openDocument(projectSession.recoverLevel(draft) ?? draft.document);
    this.toast(
      !inProject
        ? "Recovery draft opened as the current document."
        : target
          ? `Level "${target.name}" replaced with the recovery draft.`
          : `Recovery draft added as a new level, "${added}".`,
    );
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

  private syncPageTitle(title: string): void {
    document.title = `${title} · MMX Studio`;
  }

  // ---------- History ----------

  /** Where Ctrl+Z/Ctrl+Y go: the surface last clicked or focused (a blurred field leaves it unchanged). */
  private undoScope: UndoScope = "level";
  noteUndoScope(target: EventTarget | null): void {
    this.undoScope = undoScopeOf(target);
  }

  /**
   * Undo a level edit, or (scope "definitions") a project object or game-data edit.
   * The latter says so in a toast: after a palette click, Ctrl+Z is not the placement's.
   */
  undo(scope: UndoScope = "level"): void {
    if (scope === "level") this.store.undo();
    else
      this.stepDefinitions(
        projectSession.undoDefinitions(),
        "Undid object edit.",
        "No object edit to undo.",
      );
  }
  redo(scope: UndoScope = "level"): void {
    if (scope === "level") this.store.redo();
    else
      this.stepDefinitions(
        projectSession.redoDefinitions(),
        "Redid object edit.",
        "No object edit to redo.",
      );
  }
  private stepDefinitions(done: boolean, doneMessage: string, noneMessage: string): void {
    this.toast(done ? doneMessage : noneMessage);
    if (done) void this.applyProjectAssets();
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
  // Copy, cut and paste act on the level only while its viewport tab is shown.
  copySelection(): void {
    if (isPanelVisible("viewport")) copySelection(this.store);
  }
  cutSelection(): void {
    if (isPanelVisible("viewport")) cutSelection(this.store);
  }
  /** Paste at the pointer when it is over the canvas, else next to the copied items. */
  paste(): void {
    if (!isPanelVisible("viewport")) return;
    this.closeEmptyContextMenu();
    const message = pasteClipboard(this.store, this.viewport?.pointerWorld() ?? undefined);
    if (message) this.toast(message);
  }

  /** Add a project enemy (data/game.json) and pick it for placing; saved with the project. */
  createEnemy(input: NewEnemyInput): void {
    const project = projectSession.getSnapshot().project;
    if (!project) return;
    const { overlay, id } = addEnemy(project.gameData, projectSession.gameData().data, input);
    this.setGameData(overlay);
    this.store.setTool("place", id);
    // Placing needs the level in view: the Start tab or a document may be covering it.
    focusPanel("viewport");
  }

  /**
   * Add a project enemy composed from abilities and pick it for placing; `edit` opens
   * it in the enemy editor instead of bringing the level forward.
   */
  createBlankEnemy(input: BlankEnemyInput, edit = false): void {
    const project = projectSession.getSnapshot().project;
    if (!project) return;
    const { overlay, id } = addBlankEnemy(project.gameData, projectSession.gameData().data, input);
    this.setGameData(overlay);
    this.store.setTool("place", id);
    if (edit) openEnemyDocument(id, overlay.prefabs?.[id]?.name ?? id);
    else focusPanel("viewport");
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
    const { overlay, id } = duplicateEnemy(
      project.gameData,
      projectSession.gameData().data,
      enemyId,
      name,
    );
    this.setGameData(overlay);
    openEnemyDocument(id, overlay.prefabs?.[id]?.name ?? id);
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

  /** Q: open the part wheel at the pointer, or close it; only while the level tab is shown. */
  togglePartWheel(): void {
    if (!isPanelVisible("viewport")) return;
    const ui = useUiStore.getState();
    ui.setPartWheelOpen(!ui.partWheelOpen);
  }

  /** A bar slot or keys 1 to 8: pick the place tool of slot `index`, keeping the bar's order. */
  pickRecentPart(index: number): void {
    if (!isPanelVisible("viewport")) return;
    const part = availableParts(useUiStore.getState().recentParts)[index];
    if (part) this.pickFromBar(part);
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

  /** Contract C-WORLD: centre the level view on a world point, keeping the zoom. */
  centerOn(x: number, y: number): void {
    this.viewport?.centerOn(x, y);
  }

  /** Open a layer's row in the Layers panel; a tile layer also becomes the paint target. */
  selectLayer(key: LayerKey): void {
    if (key.startsWith("tile:")) this.store.setTilePaint({ layerId: key.slice("tile:".length) });
    useUiStore.getState().setSelectedLayer(key);
  }

  /** Select and frame what a validation problem is about (a Problems row, a canvas badge). */
  focusProblem(issue: Pick<PositionedIssue, "objectId" | "position">): void {
    const target = problemTarget(this.store.get().document, issue);
    if (!target) return;
    if (target.kind === "object") return this.focusObject(target.id);
    if (target.kind === "decoration") return this.focusDecoration(target.id);
    if (target.kind === "position") return this.centerOn(target.x, target.y);
    this.selectLayer(`${target.kind === "tileLayer" ? "tile" : "image"}:${target.id}`);
    focusPanel("layers");
    // A tile layer covers the whole level: frame its centre, not the badge's corner.
    const { cols, rows, gridSize } = this.store.get().document;
    if (target.kind === "tileLayer") this.centerOn((cols * gridSize) / 2, (rows * gridSize) / 2);
    else this.centerOn(target.x, target.y);
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

  togglePlay(): void {
    // Play draws into the level tab, which a document tab (C-DOC) may be covering.
    if (this.store.get().mode === "edit") focusPanel("viewport");
    this.playtest.togglePlay();
  }

  /** Play with the player at a world point; the level's own Spawn does not move. */
  playFromHere(worldX: number, worldY: number): void {
    this.playtest.playFromHere(worldX, worldY);
  }

  /** "Play from here" at the right-clicked point. */
  playFromContext(): void {
    const ctx = useUiStore.getState().contextMenu;
    if (!ctx) return;
    this.closeEmptyContextMenu();
    this.playFromHere(ctx.worldX, ctx.worldY);
  }

  get playingFromHere(): boolean {
    return this.playtest.playingFromHere;
  }

  // ---------- Playtest debugger commands ----------

  playtestTogglePause(): void {
    this.playtest.togglePause();
  }
  playtestStep(): void {
    this.playtest.step();
  }
  playtestSetCheckpoint(): void {
    this.playtest.setCheckpoint();
  }
  playtestRestartCheckpoint(): void {
    this.playtest.restartCheckpoint();
  }
  playtestRestartLevel(): void {
    this.playtest.restartLevel();
  }
  playtestSeek(frame: number): void {
    this.playtest.seek(frame);
  }
  playtestNudgeTimeScale(delta: number): void {
    this.playtest.nudgeTimeScale(delta);
  }
  playtestSetInvulnerable(enabled: boolean): void {
    this.playtest.setInvulnerable(enabled);
  }
  playtestSaveReplay(): void {
    this.playtest.saveReplay();
  }
  playtestLoadReplay(): void {
    this.playtest.loadReplay();
  }
  playtestCopyDiagnostics(): void {
    this.playtest.copyDiagnostics();
  }
  playtestSelect(runtimeId: string | null): void {
    this.playtest.select(runtimeId);
  }
  playtestFocusSource(): void {
    this.playtest.focusSelectedSource();
  }

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
      hasTextSelection: hasPageTextSelection(),
      undoScope: this.undoScope,
    };

    const cmd = dispatchEditorKey(e, ctx, state.document.gridSize);
    if (!cmd) return;
    e.preventDefault();

    switch (cmd.kind) {
      case "undo":
        this.undo(cmd.scope);
        break;
      case "redo":
        this.redo(cmd.scope);
        break;
      case "save":
        this.save();
        break;
      case "newLevel":
        this.newLevel();
        break;
      case "openLevel":
        void this.openLevel();
        break;
      case "zoomIn":
        this.zoomIn();
        break;
      case "zoomOut":
        this.zoomOut();
        break;
      case "zoomReset":
        this.setZoom(1);
        break;
      case "duplicate":
        this.duplicateSelection();
        break;
      case "delete":
        this.deleteSelection();
        break;
      case "copy":
        this.copySelection();
        break;
      case "cut":
        this.cutSelection();
        break;
      case "paste":
        this.paste();
        break;
      case "fit":
        this.fit();
        break;
      case "toggleGrid":
        this.toggleGrid();
        break;
      case "toggleSnap":
        this.toggleSnap();
        break;
      case "toolSelect":
        this.store.setTool("select");
        break;
      case "toolTile":
        this.toggleTileTool();
        break;
      case "toggleTrail":
        if (isPanelVisible("viewport")) this.store.toggleTrail();
        break;
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
      case "closeContextMenu":
        this.closeEmptyContextMenu();
        break;
      case "exitFullscreen":
        void window.studio?.window.toggleFullscreen();
        break;
      case "nudge":
        nudgeSelection(this.store, cmd.dx, cmd.dy);
        break;
      case "togglePlay":
        this.togglePlay();
        break;
      case "playFromHere": {
        // From the mouse when it is over the level, else a normal Play.
        const at = this.viewport?.pointerWorld();
        if (at) this.playFromHere(at.x, at.y);
        else this.togglePlay();
        break;
      }
      case "partWheel":
        this.togglePartWheel();
        break;
      case "recentPart":
        this.pickRecentPart(cmd.index);
        break;
      case "playtestExit":
        this.playtest.stopPlay();
        break;
      case "playtestTogglePause":
        this.playtestTogglePause();
        break;
      case "playtestSetCheckpoint":
        this.playtestSetCheckpoint();
        break;
      case "playtestRestartCheckpoint":
        this.playtestRestartCheckpoint();
        break;
      case "playtestStep":
        this.playtestStep();
        break;
      case "playtestToggleInspector":
        uiState.togglePlaytestInspector();
        break;
      case "playtestNudgeTimeScale":
        this.playtestNudgeTimeScale(cmd.delta);
        break;
      case "playtestSetInvulnerable":
        this.playtestSetInvulnerable(cmd.enabled);
        break;
      case "playtestCopyDiagnostics":
        this.playtestCopyDiagnostics();
        break;
      case "playtestSaveReplay":
        this.playtestSaveReplay();
        break;
      case "playtestLoadReplay":
        this.playtestLoadReplay();
        break;
    }
  }

  toast(message: string): void {
    useUiStore.getState().addToast(message);
  }
}

/**
 * Whether selectable page text (the About dialog's URLs) is selected. An input's selection
 * outlives its focus and still shows in `toString()`, but reads as collapsed on the input's
 * parent, which inherits the body's `user-select: none`: it does not count.
 */
function hasPageTextSelection(): boolean {
  const sel = window.getSelection();
  const node = sel?.isCollapsed === false ? sel.anchorNode : null;
  const el = node instanceof Element ? node : node?.parentElement;
  return !!el && getComputedStyle(el).userSelect !== "none";
}

/**
 * A pack install's summary for a dialog: what is added, counted by kind ("26 records, 12 assets"),
 * then each key added to a record the project has (rare, and it can change gameplay), then what is
 * left as the project has it; each list shows its first 12.
 */
export function packSummary(
  title: string,
  { added, skipped }: { added: string[]; skipped: string[] },
): string {
  const counts = new Map<string, number>();
  for (const entry of added) {
    const kind = entry.slice(0, entry.indexOf(" "));
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const lines = [title, ""];
  const kinds = [...counts].map(([kind, n]) => `${n} ${kind}${n > 1 ? "s" : ""}`);
  lines.push(`Added: ${kinds.join(", ") || "nothing"}.`);
  const list = (heading: string, entries: string[]) => {
    if (entries.length === 0) return;
    lines.push(`${heading} (${entries.length}):`, ...entries.slice(0, 12).map((e) => `• ${e}`));
    if (entries.length > 12) lines.push(`• …and ${entries.length - 12} more`);
  };
  const keys = added.filter((entry) => entry.startsWith("key "));
  list(
    "Keys added to the project's records",
    keys.map((entry) => entry.slice("key ".length)),
  );
  list("Not changed", skipped);
  return lines.join("\n");
}

/** The one editor instance the whole renderer shares. */
export const editor = new EditorController();
