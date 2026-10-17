import {
  createLevelDocument,
  projectDefinitionIssues,
  setCatalogGameData,
  setProjectDefinitions,
  type LevelDocument,
} from "@mmx/content-schema";
import { GAME_DATA, type GameData, type GameDataOverlay } from "@mmx/engine/data";
import {
  validateProject,
  type AnimationAsset,
  type ProjectAsset,
  type ProjectObjectDefinition,
  type ValidationIssue,
} from "@mmx/project-schema";
import type { StudioProject, ProjectIssue, SpriteRegion } from "@mmx/project-io";
import { levelManifestPath, PROJECT_VALIDATION, updateLevelDocument } from "@mmx/project-io";
import { resetSheetCache } from "@mmx/renderer-pixi";
import {
  buildStarterAssets,
  buildStarterBasedAssets,
  buildStudioAssets,
  starterGameData,
  starterAssets,
  type StudioAssets,
  type StudioGameData,
} from "../assets/studioAssets.js";
import { enemyClipIssues, requiredPlayerClips } from "./clips.js";
import { projectGameData, type ProjectGameData } from "./gameData.js";
import type { RecoveryDraft } from "./persistence.js";

/** The name a recovery draft gets when it is added as a new level. */
export const recoveredLevelName = (draft: LevelDocument): string =>
  `${draft.name || "Untitled"} (recovered)`;

export type ProjectSessionState = {
  open: boolean;
  rootPath: string | null;
  project: StudioProject | null;
  issues: ProjectIssue[];
  /** Manifest edits (outside the level document) not yet saved. */
  dirty?: boolean;
  /** Unsaved `bindings.playerAnimation` for `game/data.json`, written on save. */
  playerAnimation?: string;
  /** The level the editor shows and syncs (contract C-LEVEL); the entry level on open. */
  currentLevelId?: string;
  /** Contract C-WORK: an unsaved project in Studio's work folder, moved to a picked folder on its first Save. */
  untitled: boolean;
};

const EMPTY: ProjectSessionState = {
  open: false,
  rootPath: null,
  project: null,
  issues: [],
  untitled: false,
};

/** An untitled project left in Studio's work folder (`list-work-projects`). */
export type WorkProject = { rootPath: string; name: string; modifiedAt: number };

const unavailable = (): ProjectIssue[] => [
  {
    severity: "error",
    code: "project.unavailable",
    path: "/",
    message: "Project I/O is only available in the Electron shell.",
  },
];

/** A project id from its name, as `name.slug.project` (`fallback` when nothing is left). */
const projectId = (name: string, fallback: string): string => {
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return id.length > 0 ? `${id}.project` : fallback;
};

function mapSchemaIssues(issues: ValidationIssue[]): ProjectIssue[] {
  return issues.map((issue) => ({
    severity: issue.severity,
    code: issue.code,
    message: issue.message,
    path: issue.path,
  }));
}

let catalogData: GameData | null = null;

/** Point the object catalog at the project's data (only when it changed: that regenerates it). */
function applyCatalogData(overlay: GameDataOverlay | undefined): void {
  const { data, issues } = projectGameData(overlay);
  if (data === catalogData) return;
  catalogData = data;
  // The overlay's prefabs leave the palette's Base; a broken overlay adds none.
  setCatalogGameData(data, issues.length === 0 ? overlay : undefined);
}

function validateOpenProject(project: StudioProject): ProjectIssue[] {
  const objects = project.manifest.objects ?? [];
  const gameData = projectGameData(project.gameData);
  // Project objects may derive from the project's enemies: the catalog comes first.
  applyCatalogData(project.gameData);
  const validation = { ...PROJECT_VALIDATION, loadoutIds: [...gameData.compiled.loadouts.keys()] };
  return [
    ...gameData.issues,
    // Only on data that compiles: its enemies own known abilities with full configs.
    ...(gameData.issues.length === 0
      ? enemyClipIssues(project.gameData, project.manifest.assets ?? [])
      : []),
    ...mapSchemaIssues(validateProject(project.manifest, validation).issues),
    ...projectDefinitionIssues(objects).map((issue) => ({
      severity: "error" as const,
      code: issue.code,
      message: issue.message,
      path: `/objects/${issue.index}${issue.field ? `/${issue.field}` : ""}`,
    })),
  ];
}

// `player.clips` is derived from the Play bindings too, so it is rebuilt with them.
const isPlayAssetIssue = (issue: ProjectIssue): boolean =>
  issue.code.startsWith("play-assets.") || issue.code === "player.clips";

const bindingIssue = (error: unknown): ProjectIssue => ({
  severity: "warning",
  code: "play-assets.bindings",
  path: "/game/data.json",
  message: error instanceof Error ? error.message : String(error),
});

/** `gameData` is null when the project has no game/data.json yet. */
type PlayData = { gameData: StudioGameData | null; urls: Record<string, string> };

/** The project's definitions: its manifest objects and data/game.json records. */
type Definitions = {
  objects: ProjectObjectDefinition[] | undefined;
  gameData: GameDataOverlay | undefined;
};

/** Definition edits kept for undo; snapshots share unchanged records, so each is small. */
const DEFINITION_HISTORY_DEPTH = 100;

export class ProjectSession {
  private state: ProjectSessionState = { ...EMPTY };
  private assets: Promise<StudioAssets | null> = Promise.resolve(starterAssets);
  private readonly listeners = new Set<() => void>();
  /** The open project's `game/data.json` and asset data URLs, as last read from disk. */
  private playData: PlayData | null = null;
  private loaded: StudioAssets | null = starterAssets;
  /** Definition snapshots before (undo) and after (redo) the current one; reset on project open/close. */
  private undoStack: Definitions[] = [];
  private redoStack: Definitions[] = [];
  /** Ids of levels deleted since the project opened: their files stay on disk, so new levels never reuse them. */
  private removedLevelIds = new Set<string>();
  /** Stops Play and drops viewport sprites; runs before old sheet textures are destroyed. */
  beforeSheetReset: () => void = () => {};
  /** Work projects on disk, as last listed (plus the ones created since). */
  private workProjects: WorkProject[] = [];

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): ProjectSessionState => this.state;

  /** The open project's game data (the engine's when none is open or its data/game.json has errors). */
  gameData(): ProjectGameData {
    return projectGameData(this.state.project?.gameData);
  }

  /** The last built sprites and animations, for previews; null while none are loaded. */
  loadedAssets(): StudioAssets | null {
    return this.loaded;
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private setState(next: ProjectSessionState): void {
    // Before listeners run: the palette, levels and validation resolve instances against these.
    applyCatalogData(next.project?.gameData);
    setProjectDefinitions(next.project?.manifest.objects ?? []);
    this.state = next;
    this.emit();
  }

  /** Replace the open project (or close it) and reload its assets; a new project starts a new definition history. */
  private switchProject(next: ProjectSessionState, keepHistory = false): void {
    if (!keepHistory) {
      this.undoStack = [];
      this.redoStack = [];
      this.removedLevelIds = new Set();
      const levels = next.project?.levels ?? [];
      const entryId = next.project?.manifest.entryLevelId;
      next = {
        ...next,
        currentLevelId: levels.find((level) => level.id === entryId)?.id ?? levels[0]?.id,
      };
    }
    this.setState(next);
    // Chained so two quick switches never load sheets concurrently.
    this.assets = this.assets.catch(() => null).then(() => this.loadAssets());
  }

  /**
   * Sprites, animations and sounds for Play and the viewport: the open project's,
   * the starter's when none is open, or null when the project's bindings are
   * invalid (the reason is reported in the Problems panel).
   */
  getAssets(): Promise<StudioAssets | null> {
    return this.assets;
  }

  private async loadAssets(): Promise<StudioAssets | null> {
    const { rootPath, project } = this.state;
    const bridge = window.studio?.project;

    // Nothing may draw the previous project's sheets once the reset destroys them.
    this.beforeSheetReset();
    await resetSheetCache();
    this.playData = null;
    this.loaded = null;
    if (!bridge || !rootPath || !project) {
      const assets = buildStarterAssets();
      await assets.catalog.load();
      this.loaded = assets;
      return assets;
    }

    const issues: ProjectIssue[] = [];
    try {
      const result = await bridge.readPlayAssets(rootPath, project.manifest.assets);
      issues.push(...result.issues);
      if (!result.ok) throw new Error("Project assets could not be read.");
      this.playData = result.value as PlayData;
    } catch (error) {
      issues.push(bindingIssue(error));
    }
    return this.buildPlayAssets(rootPath, issues);
  }

  /**
   * Build Play's assets from the last read files and the current manifest. Sheets
   * keep their keys and URLs, so a manifest-only edit rebuilds without a sheet reset.
   */
  private async buildPlayAssets(
    rootPath: string | null,
    issues: ProjectIssue[] = [],
  ): Promise<StudioAssets | null> {
    const project = this.state.project;
    let assets: StudioAssets | null = null;
    if (this.playData && project) {
      const { gameData, urls } = this.playData;
      try {
        // No game/data.json yet (a new project) is no problem: the starter's, with its assets.
        const base = gameData ?? starterGameData;
        const data = this.state.playerAnimation
          ? {
              ...base,
              bindings: { ...base.bindings, playerAnimation: this.state.playerAnimation },
            }
          : base;
        // Read from disk: buildStudioAssets reports a missing `bindings`.
        const playerAnimation = data.bindings?.playerAnimation;
        const { data: engineData, compiled } = projectGameData(project.gameData);
        const resolveUrl = (asset: { id: string }) => urls[asset.id] ?? "";
        // Only then: a project of its own that lost a bound asset must say so, as its build would.
        const { enemies, pickups } = engineData;
        assets = gameData
          ? buildStudioAssets(project.manifest, data, resolveUrl, enemies, pickups)
          : buildStarterBasedAssets(project.manifest, data, resolveUrl, enemies, pickups);
        await assets.catalog.load();
        // Looked up in the assets Play uses: the player may still be the starter's.
        const player = assets.project.assets.find((asset) => asset.id === playerAnimation);
        const clips = player?.kind === "animation" ? player.animations : {};
        const missing = requiredPlayerClips(project.manifest.player?.loadout, compiled).filter(
          (name) => !clips[name],
        );
        if (missing.length > 0) {
          issues.push({
            severity: "warning",
            code: "player.clips",
            path: "/game/data.json",
            message: `Player animation '${playerAnimation}' has no clip for: ${missing.join(", ")}.`,
          });
        }
      } catch (error) {
        assets = null;
        issues.push(bindingIssue(error));
      }
    }
    if (this.state.rootPath === rootPath) {
      this.loaded = assets;
      this.setState({
        ...this.state,
        issues: [...this.state.issues.filter((entry) => !isPlayAssetIssue(entry)), ...issues],
      });
    }
    return assets;
  }

  /** Rebuild Play's assets after a manifest or binding edit (no disk read). */
  private refreshAssets(): void {
    const rootPath = this.state.rootPath;
    this.assets = this.assets.catch(() => null).then(() => this.buildPlayAssets(rootPath));
  }

  /** The document of the level the editor shows (contract C-LEVEL), or null without a project. */
  getCurrentLevelDocument(): LevelDocument | null {
    const { project, currentLevelId } = this.state;
    return project?.levels.find((level) => level.id === currentLevelId)?.document ?? null;
  }

  /** Store the editor's copy of a level; a changed document marks the project unsaved. */
  syncLevel(levelId: string, document: LevelDocument): void {
    const project = this.state.project;
    const stored = project?.levels.find((level) => level.id === levelId);
    if (!project || !stored) return;
    const nextProject = updateLevelDocument(project, levelId, document);
    this.setState({
      ...this.state,
      project: nextProject,
      // shortcut: an edit undone back to the saved level still reads as unsaved; keep the saved documents to compare if that confuses.
      dirty: this.state.dirty || stored.document !== document,
      issues: [...validateOpenProject(nextProject), ...this.state.issues.filter(isPlayAssetIssue)],
    });
  }

  /** Every level's document, the shown one as `live` (the store's copy); just `live` without a project. */
  levelDocuments(live: LevelDocument): LevelDocument[] {
    const { project, currentLevelId } = this.state;
    if (!project) return [live];
    return project.levels.map((level) => (level.id === currentLevelId ? live : level.document));
  }

  /**
   * The level a recovery draft restores over: the one with its id, only when the draft was
   * written in this project. A draft from another project, none or an unknown one gets null.
   */
  recoveryTarget(draft: RecoveryDraft): LevelDocument | null {
    const { project, rootPath } = this.state;
    if (!project || draft.rootPath !== rootPath) return null;
    return project.levels.find((level) => level.id === draft.document.id)?.document ?? null;
  }

  /**
   * Make the level a recovery draft was saved from current ({@link recoveryTarget}), or add the
   * draft as a new "(recovered)" level; returns the document to open, null without a project.
   * A draft is never synced into another level's slot.
   */
  recoverLevel(draft: RecoveryDraft): LevelDocument | null {
    if (!this.state.project) return null;
    if (this.recoveryTarget(draft)) {
      this.setCurrentLevel(draft.document.id);
      return draft.document;
    }
    const id = this.addLevel(recoveredLevelName(draft.document), draft.document);
    if (id) this.setCurrentLevel(id);
    return this.getCurrentLevelDocument();
  }

  /** Make `id` the level the editor syncs; the caller opens its document in the store. */
  setCurrentLevel(id: string): void {
    if (!this.state.project?.levels.some((level) => level.id === id)) return;
    this.setState({ ...this.state, currentLevelId: id });
  }

  /** Apply a level-list edit: marked unsaved and revalidated, written on save. */
  private editLevels(nextProject: StudioProject, currentLevelId = this.state.currentLevelId): void {
    this.setState({
      ...this.state,
      project: nextProject,
      currentLevelId,
      dirty: true,
      issues: [...validateOpenProject(nextProject), ...this.state.issues.filter(isPlayAssetIssue)],
    });
  }

  /**
   * Append a level named `name` (a blank one, or `document`) at `levels/<id>.json`; returns its
   * id (`level.<slug>`, suffixed when taken), or null without a project. Written on save.
   */
  addLevel(name: string, document?: LevelDocument): string | null {
    const project = this.state.project;
    if (!project) return null;
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ".")
        .replace(/^\.+|\.+$/g, "")
        .replace(/^level(\.|$)/, "") || "untitled";
    const taken = new Set([
      ...project.manifest.levels.map((level) => level.id),
      ...this.removedLevelIds,
    ]);
    let id = `level.${slug}`;
    for (let n = 2; taken.has(id); n++) id = `level.${slug}.${n}`;
    // shortcut: a file left by a level deleted in an earlier session, or written by hand, is overwritten on save; check the disk if that bites.
    const path = levelManifestPath(id);
    const level = { ...(document ?? createLevelDocument()), id, name };
    this.editLevels({
      ...project,
      manifest: { ...project.manifest, levels: [...project.manifest.levels, { id, path }] },
      levels: [...project.levels, { id, path, document: level }],
    });
    return id;
  }

  /** Rename a level (its document's `name`); its id and file path stay. */
  renameLevel(id: string, name: string): void {
    const document = this.state.project?.levels.find((level) => level.id === id)?.document;
    if (!this.state.project || !document || document.name === name) return;
    this.editLevels(updateLevelDocument(this.state.project, id, { ...document, name }));
  }

  /** Move a level to `toIndex` in the manifest's order (and the loaded levels', kept alike). */
  moveLevel(id: string, toIndex: number): void {
    const project = this.state.project;
    const from = project?.manifest.levels.findIndex((level) => level.id === id) ?? -1;
    if (!project || from < 0 || toIndex < 0 || toIndex >= project.manifest.levels.length) return;
    if (from === toIndex) return;
    const move = <T extends { id: string }>(list: T[]): T[] => {
      const next = list.filter((level) => level.id !== id);
      next.splice(
        toIndex,
        0,
        list.find((level) => level.id === id)!,
      );
      return next;
    };
    this.editLevels({
      ...project,
      manifest: { ...project.manifest, levels: move(project.manifest.levels) },
      levels: move(project.levels),
    });
  }

  /** Make `id` the level Play and the exported game start from. */
  setEntryLevel(id: string): void {
    const project = this.state.project;
    if (!project || project.manifest.entryLevelId === id) return;
    if (!project.levels.some((level) => level.id === id)) return;
    this.editLevels({ ...project, manifest: { ...project.manifest, entryLevelId: id } });
  }

  /**
   * Drop a level from the project; refused (false) for the entry level and the last one.
   * shortcut: its file stays on disk (save never deletes); remove it on save if orphans pile up.
   */
  deleteLevel(id: string): boolean {
    const project = this.state.project;
    if (!project || id === project.manifest.entryLevelId || project.levels.length <= 1) {
      return false;
    }
    if (!project.levels.some((level) => level.id === id)) return false;
    this.removedLevelIds.add(id);
    this.editLevels(
      {
        ...project,
        manifest: {
          ...project.manifest,
          levels: project.manifest.levels.filter((level) => level.id !== id),
        },
        levels: project.levels.filter((level) => level.id !== id),
      },
      // Never left syncing a level that is gone; the editor switches away first.
      this.state.currentLevelId === id ? project.manifest.entryLevelId : this.state.currentLevelId,
    );
    return true;
  }

  /** Set `player.loadout` in the open project's manifest; saved with the project. */
  setPlayerLoadout(loadout: string): void {
    const project = this.state.project;
    if (!project || project.manifest.player?.loadout === loadout) return;
    const nextProject = { ...project, manifest: { ...project.manifest, player: { loadout } } };
    this.setState({
      ...this.state,
      project: nextProject,
      dirty: true,
      issues: [...validateOpenProject(nextProject), ...this.state.issues.filter(isPlayAssetIssue)],
    });
    // The loadout decides which player clips Problems reports as missing.
    this.refreshAssets();
  }

  private definitions(): Definitions | null {
    const project = this.state.project;
    return project ? { objects: project.manifest.objects, gameData: project.gameData } : null;
  }

  /** Make `next` the project's definitions (re-registering the catalog); saved with the project. */
  private applyDefinitions(next: Definitions): void {
    const project = this.state.project;
    if (!project) return;
    const { objects: _objects, ...manifest } = project.manifest;
    const nextProject = {
      ...project,
      manifest: next.objects ? { ...manifest, objects: next.objects } : manifest,
      // Undoing the first enemy keeps an empty overlay, so saving clears an already written data/game.json.
      gameData: next.gameData ?? (project.gameData && { schemaVersion: GAME_DATA.schemaVersion }),
    };
    this.setState({
      ...this.state,
      project: nextProject,
      // shortcut: undoing back to the saved definitions still reads as unsaved; compare with a saved snapshot if that confuses.
      dirty: true,
      issues: [...validateOpenProject(nextProject), ...this.state.issues.filter(isPlayAssetIssue)],
    });
    // Project enemies drawn from an animation asset are bound to it in Play and the viewport.
    if (nextProject.gameData !== project.gameData) this.refreshAssets();
  }

  /** Record the current definitions for undo, then apply `next`; an edit that changes nothing is dropped. */
  private editDefinitions(patch: Partial<Definitions>): void {
    const current = this.definitions();
    if (!current) return;
    const next = { ...current, ...patch };
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    this.undoStack.push(current);
    if (this.undoStack.length > DEFINITION_HISTORY_DEPTH) this.undoStack.shift();
    this.redoStack = [];
    this.applyDefinitions(next);
  }

  /** Replace the open project's object definitions (undoable); saved with the project. */
  setObjects(objects: ProjectObjectDefinition[]): void {
    this.editDefinitions({ objects });
  }

  /** Replace the project's `data/game.json` records (undoable); saved with the project. */
  setGameData(gameData: GameDataOverlay): void {
    this.editDefinitions({ gameData });
  }

  get canUndoDefinitions(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedoDefinitions(): boolean {
    return this.redoStack.length > 0;
  }

  /** Undo the last object or game-data edit; false when there is none. */
  undoDefinitions(): boolean {
    return this.step(this.undoStack, this.redoStack);
  }

  /** Redo the last undone object or game-data edit; false when there is none. */
  redoDefinitions(): boolean {
    return this.step(this.redoStack, this.undoStack);
  }

  private step(from: Definitions[], to: Definitions[]): boolean {
    const current = this.definitions();
    const target = from.pop();
    if (!current || !target) return false;
    to.push(current);
    this.applyDefinitions(target);
    return true;
  }

  /** An `animation` asset of the open project, or null. */
  animationAsset(assetId: string): AnimationAsset | null {
    const asset = this.state.project?.manifest.assets.find((entry) => entry.id === assetId);
    return asset?.kind === "animation" ? asset : null;
  }

  /** Replace, add or (with null) remove an `animation` asset (contract C-CLIP); saved with the project. */
  setAnimationAsset(assetId: string, next: AnimationAsset | null): void {
    const project = this.state.project;
    if (!project) return;
    const index = project.manifest.assets.findIndex((asset) => asset.id === assetId);
    const assets = project.manifest.assets.filter((asset) => asset.id !== assetId);
    if (next) assets.splice(index < 0 ? assets.length : index, 0, next);
    const nextProject = { ...project, manifest: { ...project.manifest, assets } };
    this.setState({
      ...this.state,
      project: nextProject,
      dirty: true,
      issues: [...validateOpenProject(nextProject), ...this.state.issues.filter(isPlayAssetIssue)],
    });
    this.refreshAssets();
  }

  /** The player's animation asset id: the unsaved choice, else `game/data.json`'s. */
  playerAnimation(): string | null {
    return this.state.playerAnimation ?? this.playData?.gameData?.bindings?.playerAnimation ?? null;
  }

  /** Bind the player's animation (`game/data.json` bindings.playerAnimation); written on save. */
  setPlayerAnimation(assetId: string): void {
    if (!this.state.project) return;
    this.setState({ ...this.state, playerAnimation: assetId, dirty: true });
    this.refreshAssets();
  }

  /** A sprite asset's saved `regions` (contract C-REGIONS); [] when absent. */
  spriteRegions(assetId: string): SpriteRegion[] {
    const asset = this.state.project?.manifest.assets.find((entry) => entry.id === assetId);
    return asset?.kind === "sprite" ? [...(asset.regions ?? [])] : [];
  }

  /** Set (or with [] drop) a sprite asset's `regions` in the manifest; saved with the project. */
  setSpriteRegions(assetId: string, regions: SpriteRegion[]): void {
    const project = this.state.project;
    if (!project) return;
    const assets = project.manifest.assets.map((asset) => {
      if (asset.id !== assetId || asset.kind !== "sprite") return asset;
      const { regions: _old, ...rest } = asset;
      return regions.length > 0 ? { ...rest, regions } : rest;
    });
    const nextProject = { ...project, manifest: { ...project.manifest, assets } };
    this.setState({
      ...this.state,
      project: nextProject,
      dirty: true,
      issues: [...validateOpenProject(nextProject), ...this.state.issues.filter(isPlayAssetIssue)],
    });
  }

  /** One image/sprite asset of the open project as a data URL, or null when unreadable. */
  async readAssetUrl(assetId: string): Promise<string | null> {
    const bridge = window.studio?.project;
    const { rootPath, project } = this.state;
    const asset = project?.manifest.assets.find((entry) => entry.id === assetId);
    if (!bridge || !rootPath || !asset) return null;
    const result = await bridge.readPlayAssets(rootPath, [asset]);
    return result.ok ? (result.value.urls[assetId] ?? null) : null;
  }

  /**
   * Pick a PNG, copy it into the project as an `image` (or `sprite` sheet, or `tileset`)
   * asset and reload the assets. Returns the new asset id, or null when cancelled;
   * throws when the import fails. The manifest change is saved with the project.
   */
  async importImage(kind: "image" | "sprite" | "tileset" = "image"): Promise<string | null> {
    const bridge = window.studio?.project;
    const { rootPath, project } = this.state;
    if (!bridge || !rootPath || !project) return null;
    const file = await bridge.pickImportFile([{ name: "PNG image", extensions: ["png"] }]);
    if (!file) return null;
    const result = await bridge.importAsset(rootPath, project, {
      sourcePath: file.path,
      kind,
    });
    if (!result.ok) throw new Error(result.issues[0]?.message ?? "Import failed.");
    this.switchProject(
      {
        ...this.state,
        project: result.value.project,
        dirty: true,
        issues: [
          ...validateOpenProject(result.value.project),
          ...this.state.issues.filter(isPlayAssetIssue),
        ],
      },
      true,
    );
    return result.value.assetId;
  }

  async createProject(): Promise<ProjectIssue[]> {
    const bridge = window.studio?.project;
    if (!bridge) return unavailable();

    const rootPath = await bridge.pickDirectory("Create Project");
    if (!rootPath) return [];

    const name = window.prompt("Project name?", "Untitled Project")?.trim();
    if (!name) return [];

    const result = await bridge.create(rootPath, { id: projectId(name, "untitled.project"), name });
    if (!result.ok) {
      this.switchProject({ ...EMPTY, issues: result.issues });
      return result.issues;
    }

    this.switchProject({
      open: true,
      rootPath: result.value.rootPath,
      project: result.value.project,
      issues: [...result.issues, ...validateOpenProject(result.value.project)],
      untitled: false,
    });
    return this.state.issues;
  }

  async createFromStarter(): Promise<ProjectIssue[]> {
    const bridge = window.studio?.project;
    if (!bridge) return unavailable();

    const rootPath = await bridge.pickDirectory("Create MMX Starter Project");
    if (!rootPath) return [];

    const name = window.prompt("Project name?", "MMX Project")?.trim();
    if (!name) return [];

    const result = await bridge.createFromStarter(rootPath, {
      id: projectId(name, "mmx.project"),
      name,
    });
    if (!result.ok) {
      this.switchProject({ ...EMPTY, issues: result.issues });
      return result.issues;
    }

    this.switchProject({
      open: true,
      rootPath: result.value.rootPath,
      project: result.value.project,
      issues: [...result.issues, ...validateOpenProject(result.value.project)],
      untitled: false,
    });
    return this.state.issues;
  }

  /**
   * Load the project at `path` (a recent project, or with `untitled` a work project to restore),
   * or at a folder the user picks.
   */
  async openProject(path?: string, untitled = false): Promise<ProjectIssue[]> {
    const bridge = window.studio?.project;
    if (!bridge) return unavailable();

    const rootPath = path ?? (await bridge.pickDirectory("Open Project"));
    if (!rootPath) return [];

    const result = await bridge.load(rootPath);
    if (!result.ok) {
      // A missing, moved or invalid folder must not close the project still open; Problems
      // lists why it was refused until the next edit or open recomputes the issues.
      if (this.state.open) this.setState({ ...this.state, issues: result.issues });
      else this.switchProject({ ...EMPTY, issues: result.issues });
      return result.issues;
    }

    this.switchProject({
      open: true,
      rootPath: result.value.rootPath,
      project: result.value.project,
      issues: [...result.issues, ...validateOpenProject(result.value.project)],
      untitled,
      // Never saved to a folder of the user's: it reads as unsaved until then.
      dirty: untitled,
    });
    return this.state.issues;
  }

  /** File → Import from Steam installs: build the Zero × MMX project into a picked folder and open it. */
  async importFromSteam(onProgress: (step: string) => void): Promise<ProjectIssue[]> {
    const bridge = window.studio?.project;
    const importer = window.studio?.import;
    if (!bridge || !importer) return unavailable();

    const rootPath = await bridge.pickDirectory("Import from Steam installs: output folder");
    if (!rootPath) return [];

    const unsubscribe = importer.onImportProgress(onProgress);
    try {
      const result = await importer.fromSteam(rootPath);
      if (!result.ok) return result.issues;
      this.switchProject({
        open: true,
        rootPath: result.value.rootPath,
        project: result.value.project,
        issues: [...result.issues, ...validateOpenProject(result.value.project)],
        untitled: false,
      });
      return this.state.issues;
    } finally {
      unsubscribe();
    }
  }

  async saveProject(): Promise<ProjectIssue[]> {
    const bridge = window.studio?.project;
    const { rootPath, project } = this.state;
    if (!bridge || !rootPath || !project) return [];

    const result = await bridge.save(rootPath, project);
    if (!result.ok) {
      this.setState({ ...this.state, issues: result.issues });
      return result.issues;
    }
    // After the manifest, so the bound animation asset is on disk first.
    const { playerAnimation } = this.state;
    let seeded: StudioProject | null = null;
    if (playerAnimation) {
      const written = await bridge.writePlayerAnimation(rootPath, playerAnimation);
      if (!written.ok) {
        this.setState({ ...this.state, issues: written.issues });
        return written.issues;
      }
      if (written.value) {
        // Seeded from the starter: its bound assets were added to the project, so Play reads them.
        seeded = written.value;
      } else if (this.playData?.gameData) {
        const { gameData } = this.playData;
        this.playData = {
          ...this.playData,
          gameData: { ...gameData, bindings: { ...gameData.bindings, playerAnimation } },
        };
      }
    }

    this.setState({
      ...this.state,
      project: seeded ?? result.value.project,
      dirty: false,
      playerAnimation: undefined,
      issues: [...result.issues, ...validateOpenProject(seeded ?? result.value.project)],
    });
    if (seeded) {
      // Awaited: the first Save of an untitled project moves the folder right after.
      this.assets = this.assets.catch(() => null).then(() => this.loadAssets());
      await this.assets;
    }
    return this.state.issues;
  }

  /**
   * Contract C-WORK: create an untitled project in Studio's work folder with `document` as its
   * entry level and open it, unsaved. Nothing is open on failure, as before.
   */
  async createWorkProject(document: LevelDocument): Promise<ProjectIssue[]> {
    const bridge = window.studio?.project;
    if (!bridge) return unavailable();
    const result = await bridge.createWorkProject({
      name: "Untitled Project",
      initialLevel: document,
    });
    if (!result.ok) return result.issues;
    const { rootPath, project } = result.value;
    this.workProjects = [
      { rootPath, name: project.manifest.name, modifiedAt: Date.now() },
      ...this.workProjects,
    ];
    this.switchProject({
      open: true,
      rootPath,
      project,
      issues: [...result.issues, ...validateOpenProject(project)],
      untitled: true,
      dirty: true,
    });
    return this.state.issues;
  }

  /**
   * First Save of an untitled project: pick a folder (null when cancelled, nothing changed), then
   * save as `name` in the work folder and move the whole project there. On failure the project
   * stays untitled, in the work folder, and the issues say why.
   */
  async saveUntitled(name: string): Promise<ProjectIssue[] | null> {
    const bridge = window.studio?.project;
    const { rootPath: workRoot, project, untitled } = this.state;
    if (!bridge) return unavailable();
    if (!workRoot || !project || !untitled) return [];
    const destination = await bridge.pickWorkDestination("Save Project", workRoot);
    if (!destination || this.state.rootPath !== workRoot) return null;

    const manifest = { ...project.manifest, id: projectId(name, "untitled.project"), name };
    this.setState({ ...this.state, project: { ...this.state.project!, manifest } });
    const saved = await this.saveProject();
    if (saved.some((issue) => issue.severity === "error")) return saved;

    const moved = await bridge.moveWorkProject({ workRoot, destination });
    if (!moved.ok) {
      // Saved, but only in the work folder: still unsaved for the user (opening another asks).
      this.setState({
        ...this.state,
        dirty: true,
        issues: [...moved.issues, ...this.state.issues],
      });
      return moved.issues;
    }
    this.workProjects = this.workProjects.filter((entry) => entry.rootPath !== workRoot);
    // Moved, so the work folder is gone even if another project was opened meanwhile.
    if (this.state.rootPath !== workRoot) return moved.issues;
    this.setState({
      ...this.state,
      rootPath: moved.value.rootPath,
      untitled: false,
      issues: [...moved.issues, ...this.state.issues],
    });
    return this.state.issues;
  }

  /** Re-read the work projects on disk (the Start tab's "unsaved projects"). */
  async listWorkProjects(): Promise<WorkProject[]> {
    const bridge = window.studio?.project;
    if (!bridge?.listWorkProjects) return [];
    this.workProjects = await bridge.listWorkProjects();
    // A new state object, so subscribers re-render with the new list.
    this.setState({ ...this.state });
    return this.workProjects;
  }

  /** Work projects other than the open one, as last listed. */
  leftoverWorkProjects(): WorkProject[] {
    return this.workProjects.filter((entry) => entry.rootPath !== this.state.rootPath);
  }

  /** Delete a work project that is not the open one; its files are gone for good. */
  async deleteWorkProject(rootPath: string): Promise<ProjectIssue[]> {
    const bridge = window.studio?.project;
    if (!bridge) return unavailable();
    if (rootPath === this.state.rootPath) return [];
    const result = await bridge.deleteWorkProject(rootPath);
    if (result.ok) await this.listWorkProjects();
    return result.issues;
  }

  async exportProject(): Promise<ProjectIssue[]> {
    const bridge = window.studio?.project;
    const { rootPath, project } = this.state;
    if (!bridge || !rootPath || !project) {
      return [
        {
          severity: "error",
          code: "project.closed",
          path: "/",
          message: "Open a project before exporting.",
        },
      ];
    }

    const destinationRoot = await bridge.pickExportDirectory("Export Project");
    if (!destinationRoot) return [];

    const result = await bridge.export(rootPath, destinationRoot, project);
    if (!result.ok) {
      this.setState({ ...this.state, issues: result.issues });
      return result.issues;
    }

    return result.issues;
  }

  close(): void {
    this.switchProject({ ...EMPTY });
  }

  /** A manifest asset of the open project by id, or null. */
  asset(assetId: string): ProjectAsset | null {
    return this.state.project?.manifest.assets.find((entry) => entry.id === assetId) ?? null;
  }

  /** Replace one manifest asset by id (e.g. a tileset's collision); saved with the project. */
  updateAsset(asset: ProjectAsset): void {
    const project = this.state.project;
    if (!project) return;
    const assets = project.manifest.assets.map((a) => (a.id === asset.id ? asset : a));
    const nextProject = { ...project, manifest: { ...project.manifest, assets } };
    this.setState({
      ...this.state,
      project: nextProject,
      dirty: true,
      issues: [...validateOpenProject(nextProject), ...this.state.issues.filter(isPlayAssetIssue)],
    });
  }
}

export const projectSession = new ProjectSession();
