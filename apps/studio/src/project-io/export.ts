import { serializeProject, validateProject, type ProjectDocument } from "@mmx/project-schema";

import type { FileSystem } from "./fs.js";
import { PROJECT_VALIDATION } from "./project.js";
import { fail, issue, succeed, type ProjectResult, type StudioProject } from "./model.js";
import {
  CANONICAL_GAME_DATA_FILE,
  GAME_DATA_FILE,
  PORTABLE_EXPORT_FILES,
  PROJECT_MANIFEST,
} from "./paths.js";
import { collectGameBindingAssetIds, filterReferencedAssets } from "./references.js";

export type ExportProjectInput = {
  destinationExists?: "reject" | "merge";
};

export type ExportProjectResult = {
  manifestPath: string;
  exportedAssets: string[];
  exportedLevels: string[];
  exportedDataFiles: string[];
  excludedOrphans: string[];
};

async function copyPortableProjectFiles(
  sourceFs: FileSystem,
  destFs: FileSystem,
): Promise<string[]> {
  const copied: string[] = [];
  for (const relative of PORTABLE_EXPORT_FILES) {
    if (!(await sourceFs.exists(relative))) continue;
    const content = await sourceFs.readText(relative);
    await destFs.writeText(relative, content);
    copied.push(relative);
  }
  return copied;
}

async function readBindingAssetIds(sourceFs: FileSystem): Promise<string[]> {
  if (!(await sourceFs.exists(GAME_DATA_FILE))) return [];
  try {
    const raw = JSON.parse(await sourceFs.readText(GAME_DATA_FILE)) as {
      bindings?: Record<string, unknown>;
    };
    return [...collectGameBindingAssetIds(raw)];
  } catch {
    return [];
  }
}

async function assertDestinationClean(
  fs: FileSystem,
  mode: ExportProjectInput["destinationExists"],
): Promise<ProjectResult<void>> {
  if (!(await fs.exists(PROJECT_MANIFEST))) return succeed(undefined);
  if (mode === "merge") return succeed(undefined);
  return fail([
    issue(
      "export.destination.exists",
      `Export destination already contains ${PROJECT_MANIFEST}; refusing to overwrite.`,
      PROJECT_MANIFEST,
    ),
  ]);
}

export async function exportProject(
  sourceFs: FileSystem,
  destFs: FileSystem,
  project: StudioProject,
  options: ExportProjectInput = {},
): Promise<ProjectResult<ExportProjectResult>> {
  const destinationGuard = await assertDestinationClean(
    destFs,
    options.destinationExists ?? "reject",
  );
  if (!destinationGuard.ok) return fail(destinationGuard.issues);

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

  const levelDocuments = project.levels.map((level) => level.document);
  const bindingAssetIds = await readBindingAssetIds(sourceFs);
  // A binding to an asset the manifest lacks would only fail later, at build.
  const dangling = bindingAssetIds.filter(
    (id) => !project.manifest.assets.some((asset) => asset.id === id),
  );
  if (dangling.length > 0) {
    return fail(
      dangling.map((id) =>
        issue(
          "asset.missing",
          `${GAME_DATA_FILE} binds asset '${id}', which is not in the project.`,
          `/${GAME_DATA_FILE}`,
        ),
      ),
    );
  }
  // A project enemy's sheet is an animation asset id (data/game.json).
  const enemySheets = Object.values(project.gameData?.enemies ?? {}).map((enemy) => enemy.sheet);
  const referencedAssets = filterReferencedAssets(project.manifest, levelDocuments, [
    ...bindingAssetIds,
    ...enemySheets,
  ]);
  const orphanIds = new Set(
    project.manifest.assets
      .filter((asset) => !referencedAssets.some((entry) => entry.id === asset.id))
      .map((asset) => asset.id),
  );

  const exportedManifest: ProjectDocument = {
    ...project.manifest,
    assets: referencedAssets,
  };

  const missingAssets: ReturnType<typeof issue>[] = [];
  for (const [index, asset] of referencedAssets.entries()) {
    if (!(await sourceFs.exists(asset.path))) {
      missingAssets.push(
        issue(
          "asset.missing",
          `Referenced asset file '${asset.path}' for id '${asset.id}' is missing.`,
          `/assets/${index}/path`,
        ),
      );
    }
  }
  if (missingAssets.length > 0) return fail(missingAssets);

  const exportedAssets: string[] = [];
  const exportedLevels: string[] = [];

  await destFs.mkdir("levels");
  await destFs.mkdir("assets/sprites");
  await destFs.mkdir("assets/sounds");
  await destFs.mkdir("assets/fonts");

  for (const level of project.levels) {
    const exists = await sourceFs.exists(level.path);
    if (!exists) {
      return fail([
        issue("level.missing", `Level file '${level.path}' is missing.`, `/levels/${level.id}`),
      ]);
    }
    const json = await sourceFs.readText(level.path);
    await destFs.writeText(level.path, json);
    exportedLevels.push(level.path);
  }

  for (const asset of referencedAssets) {
    const bytes = await sourceFs.readBytes(asset.path);
    await destFs.writeBytes(asset.path, bytes);
    exportedAssets.push(asset.path);
  }

  const manifestJson = serializeProject(exportedManifest);
  await destFs.writeText(PROJECT_MANIFEST, manifestJson);
  const exportedDataFiles = await copyPortableProjectFiles(sourceFs, destFs);
  // As the manifest: a project migrated on load (withStarterPack) has its pack records only in memory.
  if (project.gameData) {
    await destFs.writeText(
      CANONICAL_GAME_DATA_FILE,
      `${JSON.stringify(project.gameData, null, 2)}\n`,
    );
    if (!exportedDataFiles.includes(CANONICAL_GAME_DATA_FILE)) {
      exportedDataFiles.push(CANONICAL_GAME_DATA_FILE);
    }
  }

  return succeed({
    manifestPath: PROJECT_MANIFEST,
    exportedAssets,
    exportedLevels,
    exportedDataFiles,
    excludedOrphans: [...orphanIds],
  });
}

export function exportManifestForComparison(project: StudioProject): string {
  const levelDocuments = project.levels.map((level) => level.document);
  const referencedAssets = filterReferencedAssets(project.manifest, levelDocuments);
  return serializeProject({ ...project.manifest, assets: referencedAssets });
}
