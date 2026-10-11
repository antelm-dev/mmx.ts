import { TerrainTile, createLevelDocument, migrateDocument, type LevelDocument } from "@mmx/content-schema";
import {
  PROJECT_SCHEMA_VERSION,
  parseProject,
  serializeProject,
  validateProject,
  type ProjectDocument,
  type ProjectAsset,
} from "@mmx/project-schema";
import { COMPILED_GAME_DATA } from "@mmx/engine/data";

import type { FileSystem } from "./fs.js";
import { levelManifestPath, PROJECT_MANIFEST } from "./paths.js";
import { fail, issue, succeed, type ProjectResult, type StudioProject } from "./model.js";

/** Compiled player loadout ids a project's `player.loadout` may reference (default `player.x`). */
export const LOADOUT_IDS: readonly string[] = [...COMPILED_GAME_DATA.loadouts.keys()];
export const PROJECT_VALIDATION = { loadoutIds: LOADOUT_IDS, terrainTiles: Object.values(TerrainTile) };

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

  const manifest: ProjectDocument = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    gameVersion: input.gameVersion ?? "0.1.0",
    compatibleRuntime: input.compatibleRuntime ?? { min: "1.0.0" },
    entryLevelId: levelId,
    levels: [{ id: levelId, path: levelPath }],
    assets: [],
  };

  await fs.mkdir("levels");
  await fs.mkdir("assets/sprites");
  await fs.mkdir("assets/sounds");
  await fs.mkdir("assets/fonts");
  await fs.writeText(levelPath, `${JSON.stringify(levelDocument, null, 2)}\n`);
  await fs.writeText(PROJECT_MANIFEST, serializeProject(manifest));

  return succeed({
    root: ".",
    manifest,
    levels: [{ id: levelId, path: levelPath, document: levelDocument }],
  });
}

export async function loadProject(fs: FileSystem): Promise<ProjectResult<StudioProject>> {
  if (!(await fs.exists(PROJECT_MANIFEST))) {
    return fail([
      issue("project.missing", `Project manifest not found at ${PROJECT_MANIFEST}.`, PROJECT_MANIFEST),
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

  const parsed = parseProject(raw, PROJECT_VALIDATION);
  if (!parsed.ok || !parsed.project) {
    return fail(
      parsed.issues.map((entry) => ({
        severity: entry.severity,
        code: entry.code,
        message: entry.message,
        path: entry.path,
      })),
    );
  }

  const manifest = parsed.project;
  const levels: StudioProject["levels"] = [];
  const issues: ReturnType<typeof issue>[] = [];

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

  return succeed({ root: ".", manifest, levels }, issues);
}

export async function saveProject(
  fs: FileSystem,
  project: StudioProject,
): Promise<ProjectResult<StudioProject>> {
  const validation = validateProject(project.manifest, PROJECT_VALIDATION);
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
    levels: project.levels.map((level) =>
      level.id === levelId ? { ...level, document } : level,
    ),
  };
}
