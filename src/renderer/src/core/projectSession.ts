import { validateProject, type ValidationIssue } from "@mmx/project-schema";
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

export type ProjectSessionState = {
  open: boolean;
  rootPath: string | null;
  project: StudioProject | null;
  issues: ProjectIssue[];
  /** Manifest edits (outside the level document) not yet saved. */
  dirty?: boolean;
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

function validateOpenProject(project: StudioProject): ProjectIssue[] {
  return mapSchemaIssues(validateProject(project.manifest, PROJECT_VALIDATION).issues);
}

const isPlayAssetIssue = (issue: ProjectIssue): boolean => issue.code.startsWith("play-assets.");

export class ProjectSession {
  private state: ProjectSessionState = { ...EMPTY };
  private assets: Promise<StudioAssets | null> = Promise.resolve(starterAssets);
  private readonly listeners = new Set<() => void>();
  /** Stops Play and drops viewport sprites; runs before old sheet textures are destroyed. */
  beforeSheetReset: () => void = () => {};

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): ProjectSessionState => this.state;

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private setState(next: ProjectSessionState): void {
    this.state = next;
    this.emit();
  }

  /** Replace the open project (or close it) and reload its assets. */
  private switchProject(next: ProjectSessionState): void {
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
    if (!bridge || !rootPath || !project) {
      const assets = buildStarterAssets();
      await assets.catalog.load();
      return assets;
    }

    const issues: ProjectIssue[] = [];
    let assets: StudioAssets | null = null;
    try {
      const result = await bridge.readPlayAssets(rootPath, project.manifest.assets);
      issues.push(...result.issues);
      if (!result.ok) throw new Error("Project assets could not be read.");
      const { gameData, urls } = result.value;
      assets = buildStudioAssets(
        project.manifest,
        gameData as StudioGameData,
        (asset) => urls[asset.id] ?? "",
      );
      await assets.catalog.load();
    } catch (error) {
      assets = null;
      issues.push({
        severity: "warning",
        code: "play-assets.bindings",
        path: "/game/data.json",
        message: error instanceof Error ? error.message : String(error),
      });
    }
    if (this.state.rootPath === rootPath) {
      this.setState({
        ...this.state,
        issues: [...this.state.issues.filter((entry) => !isPlayAssetIssue(entry)), ...issues],
      });
    }
    return assets;
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
   * Pick a PNG, copy it into the project as an `image` (or `sprite` sheet) asset
   * and reload the assets. Returns the new asset id, or null when cancelled;
   * throws when the import fails. The manifest change is saved with the project.
   */
  async importImage(kind: "image" | "sprite" = "image"): Promise<string | null> {
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
    this.switchProject({
      ...this.state,
      project: result.value.project,
      dirty: true,
      issues: [...validateOpenProject(result.value.project), ...this.state.issues.filter(isPlayAssetIssue)],
    });
    return result.value.assetId;
  }

  async createProject(): Promise<ProjectIssue[]> {
    const bridge = window.studio?.project;
    if (!bridge) {
      return [{ severity: "error", code: "project.unavailable", path: "/", message: "Project I/O is only available in the Electron shell." }];
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
      return [{ severity: "error", code: "project.unavailable", path: "/", message: "Project I/O is only available in the Electron shell." }];
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
      return [{ severity: "error", code: "project.unavailable", path: "/", message: "Project I/O is only available in the Electron shell." }];
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
      return [{ severity: "error", code: "project.unavailable", path: "/", message: "Project I/O is only available in the Electron shell." }];
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

    this.setState({
      ...this.state,
      project: result.value.project,
      dirty: false,
      issues: [...result.issues, ...validateOpenProject(result.value.project)],
    });
    return this.state.issues;
  }

  async exportProject(): Promise<ProjectIssue[]> {
    const bridge = window.studio?.project;
    const { rootPath, project } = this.state;
    if (!bridge || !rootPath || !project) {
      return [{ severity: "error", code: "project.closed", path: "/", message: "Open a project before exporting." }];
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
}

export const projectSession = new ProjectSession();
