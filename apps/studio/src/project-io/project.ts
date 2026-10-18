import {
  TerrainTile,
  createLevelDocument,
  migrateDocument,
  withStarterPack,
  type LevelDocument,
  type PackRef,
} from "@mmx/content-schema";
import {
  PROJECT_SCHEMA_VERSION,
  parseProject,
  serializeProject,
  validateProject,
  type ProjectDocument,
  type ProjectAsset,
} from "@mmx/project-schema";
import { COMPILED_GAME_DATA, type GameDataOverlay } from "@mmx/engine/data";

import type { FileSystem } from "./fs.js";
import { CANONICAL_GAME_DATA_FILE, levelManifestPath, PROJECT_MANIFEST } from "./paths.js";
import { fail, issue, succeed, type ProjectResult, type StudioProject } from "./model.js";

export const PROJECT_VALIDATION = {
  terrainTiles: Object.values(TerrainTile),
};

/**
 * Validation for a project with `overlay` as its data/game.json: its `player.loadout` may name
 * an engine loadout or one the overlay adds (the merge only adds and replaces ids).
 */
export function projectValidation(overlay: GameDataOverlay | undefined) {
  const own = Object.keys(overlay?.loadouts ?? {});
  const loadoutIds = new Set([...COMPILED_GAME_DATA.loadouts.keys(), ...own]);
  return { ...PROJECT_VALIDATION, loadoutIds };
}

export type CreateProjectInput = {
  id: string;
  name: string;
  gameVersion?: string;
  compatibleRuntime?: ProjectDocument["compatibleRuntime"];
  entryLevelId?: string;
  initialLevel?: LevelDocument;
};

export async function createProject(
  fs: FileSystem,
  input: CreateProjectInput,
): Promise<ProjectResult<StudioProject>> {
  const manifestExists = await fs.exists(PROJECT_MANIFEST);
  if (manifestExists) {
    return fail([
      issue(
        "project.exists",
        `Refusing to overwrite existing project manifest at ${PROJECT_MANIFEST}.`,
        PROJECT_MANIFEST,
      ),
    ]);
  }

  const level = input.initialLevel ?? createLevelDocument({ name: input.name });
  const levelId = input.entryLevelId ?? "level.main";
  const levelPath = levelManifestPath(levelId);
  const levelDocument = { ...level, id: levelId, name: level.name || input.name };

  // A new project carries the MMX Starter, X and Zero packs (the template's art aside).
  const { manifest, overlay: gameData } = withStarterPack<ProjectDocument>(
    {
      schemaVersion: PROJECT_SCHEMA_VERSION,
      id: input.id,
      name: input.name,
      gameVersion: input.gameVersion ?? "0.1.0",
      compatibleRuntime: input.compatibleRuntime ?? { min: "1.0.0" },
      entryLevelId: levelId,
      levels: [{ id: levelId, path: levelPath }],
      assets: [],
    },
    undefined,
  );

  await fs.mkdir("levels");
  await fs.mkdir("assets/sprites");
  await fs.mkdir("assets/sounds");
  await fs.mkdir("assets/fonts");
  await fs.writeText(levelPath, `${JSON.stringify(levelDocument, null, 2)}\n`);
  // Records before the manifest's `packs`, as in saveProject.
  await fs.writeText(CANONICAL_GAME_DATA_FILE, `${JSON.stringify(gameData, null, 2)}\n`);
  await fs.writeText(PROJECT_MANIFEST, serializeProject(manifest));

  return succeed({
    root: ".",
    manifest,
    levels: [{ id: levelId, path: levelPath, document: levelDocument }],
    gameData,
  });
}

export async function loadProject(fs: FileSystem): Promise<ProjectResult<StudioProject>> {
  if (!(await fs.exists(PROJECT_MANIFEST))) {
    return fail([
      issue(
        "project.missing",
        `Project manifest not found at ${PROJECT_MANIFEST}.`,
        PROJECT_MANIFEST,
      ),
    ]);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readText(PROJECT_MANIFEST));
  } catch (error) {
    return fail([
      issue(
        "project.parse",
        error instanceof Error ? error.message : String(error),
        PROJECT_MANIFEST,
      ),
    ]);
  }

  const issues: ReturnType<typeof issue>[] = [];
  // Read first: `player.loadout` may name a loadout this overlay adds.
  let gameData: StudioProject["gameData"];
  if (await fs.exists(CANONICAL_GAME_DATA_FILE)) {
    try {
      gameData = JSON.parse(await fs.readText(CANONICAL_GAME_DATA_FILE));
    } catch (error) {
      // Like a broken manifest: opening and re-saving must not drop the file's records.
      issues.push(
        issue(
          "game-data.parse",
          error instanceof Error ? error.message : String(error),
          `/${CANONICAL_GAME_DATA_FILE}`,
        ),
      );
    }
  }

  // Like migrateDocument for levels: the packs a project lacks (withStarterPack) are added in
  // memory, not marked dirty; the next Save writes their records, then the `packs` markers. Before
  // the parse, so `player.loadout` may name a loadout they add; never over a broken data/game.json.
  if (issues.length === 0 && typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const packed = withStarterPack(raw as { packs?: PackRef[] }, gameData);
    raw = packed.manifest;
    gameData = packed.overlay;
  }

  const parsed = parseProject(raw, projectValidation(gameData));
  if (!parsed.ok || !parsed.project) {
    // A broken data/game.json may be why an overlay loadout reads as unknown: report both.
    return fail([
      ...issues,
      ...parsed.issues.map((entry) => ({
        severity: entry.severity,
        code: entry.code,
        message: entry.message,
        path: entry.path,
      })),
    ]);
  }

  const manifest = parsed.project;
  const levels: StudioProject["levels"] = [];

  for (const [index, ref] of manifest.levels.entries()) {
    if (!(await fs.exists(ref.path))) {
      issues.push(
        issue(
          "level.missing",
          `Level file '${ref.path}' for id '${ref.id}' does not exist.`,
          `/levels/${index}/path`,
        ),
      );
      continue;
    }
    try {
      const levelRaw = JSON.parse(await fs.readText(ref.path));
      const document = migrateDocument(levelRaw);
      levels.push({ id: ref.id, path: ref.path, document });
    } catch (error) {
      issues.push(
        issue(
          "level.parse",
          error instanceof Error ? error.message : String(error),
          `/levels/${index}`,
        ),
      );
    }
  }

  for (const [index, asset] of manifest.assets.entries()) {
    if (!(await fs.exists(asset.path))) {
      issues.push(
        issue(
          "asset.missing",
          `Asset file '${asset.path}' for id '${asset.id}' does not exist.`,
          `/assets/${index}/path`,
        ),
      );
    }
  }

  if (issues.some((entry) => entry.severity === "error")) {
    return fail(issues);
  }

  return succeed({ root: ".", manifest, levels, ...(gameData ? { gameData } : {}) }, issues);
}

export async function saveProject(
  fs: FileSystem,
  project: StudioProject,
): Promise<ProjectResult<StudioProject>> {
  const validation = validateProject(project.manifest, projectValidation(project.gameData));
  if (!validation.ok) {
    return fail(
      validation.issues.map((entry) => ({
        severity: entry.severity,
        code: entry.code,
        message: entry.message,
        path: entry.path,
      })),
    );
  }

  for (const level of project.levels) {
    await fs.writeText(level.path, `${JSON.stringify(level.document, null, 2)}\n`);
  }
  // Records before the manifest: a save cut short then leaves no `packs` without its records,
  // and the next load migrates again (withStarterPack only adds missing ids).
  if (project.gameData) {
    await fs.writeText(
      CANONICAL_GAME_DATA_FILE,
      `${JSON.stringify(project.gameData, null, 2)}
`,
    );
  }
  await fs.writeText(PROJECT_MANIFEST, serializeProject(project.manifest));
  return succeed(project);
}

export function updateManifestAssets(
  manifest: ProjectDocument,
  assets: ProjectAsset[],
): ProjectDocument {
  return { ...manifest, assets };
}

export function updateLevelDocument(
  project: StudioProject,
  levelId: string,
  document: LevelDocument,
): StudioProject {
  return {
    ...project,
    levels: project.levels.map((level) => (level.id === levelId ? { ...level, document } : level)),
  };
}
