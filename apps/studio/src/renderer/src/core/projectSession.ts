import {
  projectDefinitionIssues,
  setCatalogGameData,
  setProjectDefinitions,
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
import { PROJECT_VALIDATION, updateLevelDocument } from "@mmx/project-io";
import { resetSheetCache } from "@mmx/renderer-pixi";
import {
  buildStarterAssets,
  buildStudioAssets,
  starterAssets,
  type StudioAssets,
  type StudioGameData,
} from "../assets/studioAssets.js";
import { requiredPlayerClips } from "./clips.js";
import { projectGameData, type ProjectGameData } from "./gameData.js";

export type ProjectSessionState = {
  open: boolean;
  rootPath: string | null;
  project: StudioProject | null;
  issues: ProjectIssue[];
  /** Manifest edits (outside the level document) not yet saved. */
  dirty?: boolean;
  /** Unsaved `bindings.playerAnimation` for `game/data.json`, written on save. */
  playerAnimation?: string;
};

const EMPTY: ProjectSessionState = {
  open: false,
  rootPath: null,
  project: null,
  issues: [],
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

/** Point the object catalog at `data` (only when it changed: that regenerates it). */
function applyCatalogData(data: GameData): void {
  if (data === catalogData) return;
  catalogData = data;
  setCatalogGameData(data);
}

function validateOpenProject(project: StudioProject): ProjectIssue[] {
  const objects = project.manifest.objects ?? [];
  const gameData = projectGameData(project.gameData);
  // Project objects may derive from the project's enemies: the catalog comes first.
  applyCatalogData(gameData.data);
  const validation = { ...PROJECT_VALIDATION, loadoutIds: [...gameData.compiled.loadouts.keys()] };
  return [
    ...gameData.issues,
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

type PlayData = { gameData: StudioGameData; urls: Record<string, string> };

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
  /** Stops Play and drops viewport sprites; runs before old sheet textures are destroyed. */
  beforeSheetReset: () => void = () => {};

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
    applyCatalogData(projectGameData(next.project?.gameData).data);
    setProjectDefinitions(next.project?.manifest.objects ?? []);
    this.state = next;
    this.emit();
  }

  /** Replace the open project (or close it) and reload its assets; a new project starts a new definition history. */
  private switchProject(next: ProjectSessionState, keepHistory = false): void {
    if (!keepHistory) {
      this.undoStack = [];
      this.redoStack = [];
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
      const playerAnimation = this.playerAnimation();
      try {
        const data = this.state.playerAnimation
          ? {
              ...gameData,
              bindings: { ...gameData.bindings, playerAnimation: this.state.playerAnimation },
            }
          : gameData;
        const { data: engineData, compiled } = projectGameData(project.gameData);
        assets = buildStudioAssets(
          project.manifest,
          data,
          (asset) => urls[asset.id] ?? "",
          engineData.enemies,
        );
        await assets.catalog.load();
        const clips = this.animationAsset(playerAnimation ?? "")?.animations ?? {};
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

  getEntryLevelDocument() {
    const project = this.state.project;
    if (!project) return null;
    const entry = project.levels.find((level) => level.id === project.manifest.entryLevelId);
    return entry?.document ?? project.levels[0]?.document ?? null;
  }

  syncLevel(levelId: string, document: StudioProject["levels"][number]["document"]): void {
    if (!this.state.project) return;
    const nextProject = updateLevelDocument(this.state.project, levelId, document);
    this.setState({
      ...this.state,
      project: nextProject,
      issues: [...validateOpenProject(nextProject), ...this.state.issues.filter(isPlayAssetIssue)],
    });
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
    if (!bridge) {
      return [
        {
          severity: "error",
          code: "project.unavailable",
          path: "/",
          message: "Project I/O is only available in the Electron shell.",
        },
      ];
    }

    const rootPath = await bridge.pickDirectory("Create Project");
    if (!rootPath) return [];

    const name = window.prompt("Project name?", "Untitled Project")?.trim();
    if (!name) return [];

    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "");
    const projectId = id.length > 0 ? `${id}.project` : "untitled.project";

    const result = await bridge.create(rootPath, { id: projectId, name });
    if (!result.ok) {
      this.switchProject({ ...EMPTY, issues: result.issues });
      return result.issues;
    }

    this.switchProject({
      open: true,
      rootPath: result.value.rootPath,
      project: result.value.project,
      issues: [...result.issues, ...validateOpenProject(result.value.project)],
    });
    return this.state.issues;
  }

  async createFromStarter(): Promise<ProjectIssue[]> {
    const bridge = window.studio?.project;
    if (!bridge) {
      return [
        {
          severity: "error",
          code: "project.unavailable",
          path: "/",
          message: "Project I/O is only available in the Electron shell.",
        },
      ];
    }

    const rootPath = await bridge.pickDirectory("Create MMX Starter Project");
    if (!rootPath) return [];

    const name = window.prompt("Project name?", "MMX Project")?.trim();
    if (!name) return [];

    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "");
    const projectId = id.length > 0 ? `${id}.project` : "mmx.project";

    const result = await bridge.createFromStarter(rootPath, { id: projectId, name });
    if (!result.ok) {
      this.switchProject({ ...EMPTY, issues: result.issues });
      return result.issues;
    }

    this.switchProject({
      open: true,
      rootPath: result.value.rootPath,
      project: result.value.project,
      issues: [...result.issues, ...validateOpenProject(result.value.project)],
    });
    return this.state.issues;
  }

  async openProject(): Promise<ProjectIssue[]> {
    const bridge = window.studio?.project;
    if (!bridge) {
      return [
        {
          severity: "error",
          code: "project.unavailable",
          path: "/",
          message: "Project I/O is only available in the Electron shell.",
        },
      ];
    }

    const rootPath = await bridge.pickDirectory("Open Project");
    if (!rootPath) return [];

    const result = await bridge.load(rootPath);
    if (!result.ok) {
      this.switchProject({ ...EMPTY, issues: result.issues });
      return result.issues;
    }

    this.switchProject({
      open: true,
      rootPath: result.value.rootPath,
      project: result.value.project,
      issues: [...result.issues, ...validateOpenProject(result.value.project)],
    });
    return this.state.issues;
  }

  /** File → Import from Steam installs: build the Zero × MMX project into a picked folder and open it. */
  async importFromSteam(onProgress: (step: string) => void): Promise<ProjectIssue[]> {
    const bridge = window.studio?.project;
    const importer = window.studio?.import;
    if (!bridge || !importer) {
      return [
        {
          severity: "error",
          code: "project.unavailable",
          path: "/",
          message: "Project I/O is only available in the Electron shell.",
        },
      ];
    }

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
    if (playerAnimation) {
      const written = await bridge.writePlayerAnimation(rootPath, playerAnimation);
      if (!written.ok) {
        this.setState({ ...this.state, issues: written.issues });
        return written.issues;
      }
      if (this.playData) {
        const { gameData } = this.playData;
        this.playData = {
          ...this.playData,
          gameData: { ...gameData, bindings: { ...gameData.bindings, playerAnimation } },
        };
      }
    }

    this.setState({
      ...this.state,
      project: result.value.project,
      dirty: false,
      playerAnimation: undefined,
      issues: [...result.issues, ...validateOpenProject(result.value.project)],
    });
    return this.state.issues;
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
