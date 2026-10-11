import fs from "node:fs/promises";
import path from "node:path";
import {
  migrateDocument,
  TerrainTile,
  validateImageLayers,
  validateTileLayers,
} from "@mmx/content-schema";
import { COMPILED_GAME_DATA } from "@mmx/engine/data";
import { parseProject, type TilesetAsset } from "@mmx/project-schema";
import { PROJECT_MANIFEST } from "./constants.js";
import { validateLevelObjects } from "./compileLevel.js";
import { ProjectLoadError } from "./errors.js";
import { containAbsolutePath, resolveContainedProjectPath } from "./paths.js";
import type { LoadProjectResult, LoadedProject, ProjectIssue } from "./types.js";

function toIssues(
  issues: Array<{ severity?: "error" | "warning"; code: string; message: string; path: string }>,
): ProjectIssue[] {
  return issues.map((issue) => ({
    severity: issue.severity ?? "error",
    code: issue.code,
    message: issue.message,
    path: issue.path,
  }));
}

/** Width and height from a PNG's IHDR chunk; undefined for anything else. */
function pngSize(bytes: Uint8Array): { width: number; height: number } | undefined {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 24 || signature.some((byte, i) => bytes[i] !== byte)) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Tiles the tileset image holds, or undefined when its size cannot be read. */
async function tilesetTileCount(root: string, asset: TilesetAsset): Promise<number | undefined> {
  try {
    const contained = await resolveContainedProjectPath(root, asset.path);
    if (!contained.exists) return undefined; // reported by the asset file check below
    const size = pngSize(await fs.readFile(contained.absolutePath));
    if (!size) return undefined;
    const fit = Math.floor(size.width / asset.tileSize);
    return Math.min(asset.columns ?? fit, fit) * Math.floor(size.height / asset.tileSize);
  } catch (error) {
    if (error instanceof ProjectLoadError) return undefined; // reported by the asset file check below
    throw error;
  }
}

export async function loadProject(root: string): Promise<LoadProjectResult> {
  const rootResolved = path.resolve(root);
  const manifestPath = path.join(rootResolved, PROJECT_MANIFEST);

  let manifestContained;
  try {
    manifestContained = await containAbsolutePath(rootResolved, manifestPath, PROJECT_MANIFEST);
  } catch (error) {
    if (error instanceof ProjectLoadError) {
      return {
        ok: false,
        issues: [
          {
            severity: "error",
            code: error.code,
            path: PROJECT_MANIFEST,
            message: error.message,
          },
        ],
      };
    }
    throw error;
  }

  if (!manifestContained.exists) {
    return {
      ok: false,
      issues: [
        {
          severity: "error",
          code: "manifest.missing",
          path: PROJECT_MANIFEST,
          message: `Project manifest '${PROJECT_MANIFEST}' was not found.`,
        },
      ],
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(manifestContained.absolutePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      issues: [
        {
          severity: "error",
          code: "manifest.parse",
          path: PROJECT_MANIFEST,
          message: `Failed to parse '${PROJECT_MANIFEST}': ${message}`,
        },
      ],
    };
  }

  const parsed = parseProject(raw, {
    loadoutIds: COMPILED_GAME_DATA.loadouts.keys(),
    terrainTiles: Object.values(TerrainTile),
  });
  if (!parsed.ok || !parsed.project) {
    return { ok: false, issues: toIssues(parsed.issues) };
  }

  const manifest = parsed.project;
  const issues: ProjectIssue[] = toIssues(parsed.issues);
  const levels: LoadedProject["levels"] = [];
  const imageAssetIds = new Set(
    manifest.assets.filter((asset) => asset.kind === "image").map((asset) => asset.id),
  );
  const tilesets = new Map<string, number | undefined>();
  for (const asset of manifest.assets) {
    if (asset.kind === "tileset") {
      tilesets.set(asset.id, await tilesetTileCount(rootResolved, asset));
    }
  }

  for (const ref of manifest.levels) {
    let contained;
    try {
      contained = await resolveContainedProjectPath(rootResolved, ref.path);
    } catch (error) {
      if (error instanceof ProjectLoadError) {
        issues.push({
          severity: "error",
          code: error.code,
          path: `/levels/${ref.id}/path`,
          message: error.message,
        });
        continue;
      }
      throw error;
    }

    if (!contained.exists) {
      issues.push({
        severity: "error",
        code: "level.missing",
        path: ref.path,
        message: `Level file '${ref.path}' referenced by '${ref.id}' does not exist.`,
      });
      continue;
    }

    let document;
    try {
      const levelRaw = JSON.parse(await fs.readFile(contained.absolutePath, "utf8")) as unknown;
      document = migrateDocument(levelRaw);
      validateLevelObjects(document);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      issues.push({
        severity: "error",
        code: "level.invalid",
        path: ref.path,
        message: `Level '${ref.id}' failed validation: ${message}`,
      });
      continue;
    }

    const layerIssues = [
      ...validateImageLayers(document, imageAssetIds),
      ...validateTileLayers(document, tilesets),
    ];
    for (const issue of layerIssues) {
      issues.push({
        severity: issue.severity,
        code: issue.code,
        path: ref.path,
        message: `Level '${ref.id}': ${issue.message}`,
      });
    }
    levels.push({ id: ref.id, path: ref.path, document });
  }

  for (const asset of manifest.assets) {
    let contained;
    try {
      contained = await resolveContainedProjectPath(rootResolved, asset.path);
    } catch (error) {
      if (error instanceof ProjectLoadError) {
        issues.push({
          severity: "error",
          code: error.code,
          path: `/assets/${asset.id}/path`,
          message: `Asset '${asset.id}': ${error.message}`,
        });
        continue;
      }
      throw error;
    }

    if (!contained.exists) {
      issues.push({
        severity: "error",
        code: "asset.missing",
        path: asset.path,
        message: `Asset '${asset.id}' file '${asset.path}' does not exist.`,
      });
    }
  }

  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  if (errorCount > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    value: { root: rootResolved, manifest, levels },
    issues,
  };
}

export async function requireProject(root: string): Promise<LoadedProject> {
  const result = await loadProject(root);
  if (!result.ok) {
    const first = result.issues.find((issue) => issue.severity === "error");
    throw new ProjectLoadError(
      first?.code ?? "project.invalid",
      first?.path ?? "/",
      first?.message ?? "Project failed validation.",
    );
  }
  return result.value;
}
