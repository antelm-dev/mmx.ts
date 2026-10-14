import { isLogicalId, type AssetKind, type ProjectAsset } from "@mmx/project-schema";

import type { FileSystem } from "./fs.js";
import {
  assetSubdirForKind,
  basenamePortable,
  joinRelative,
  normalizeRelativePath,
  sanitizeLogicalIdCandidate,
  stemPortable,
} from "./paths.js";
import { fail, issue, succeed, type ProjectResult } from "./model.js";

export type ImportAssetInput = {
  sourcePath: string;
  kind: AssetKind;
  logicalId?: string;
  collision?: "reject" | "rename";
};

export type ImportAssetResult = {
  asset: ProjectAsset;
  copiedTo: string;
};

function defaultLogicalId(sourcePath: string, kind: AssetKind): string {
  const stem = sanitizeLogicalIdCandidate(stemPortable(sourcePath));
  const prefix =
    kind === "font" || kind === "image" || kind === "tileset"
      ? kind
      : kind === "sound"
        ? "sfx"
        : "sprite";
  return `${prefix}.${stem}`;
}

function resolveCollisionId(baseId: string, existing: Set<string>): string | null {
  if (!existing.has(baseId)) return baseId;
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${baseId}.${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return null;
}

export async function importAsset(
  fs: FileSystem,
  existingAssets: ProjectAsset[],
  input: ImportAssetInput,
): Promise<ProjectResult<ImportAssetResult>> {
  const collisionMode = input.collision ?? "reject";
  const existingIds = new Set(existingAssets.map((asset) => asset.id));
  const requestedId = input.logicalId ?? defaultLogicalId(input.sourcePath, input.kind);

  if (!isLogicalId(requestedId)) {
    return fail([
      issue("asset.id.malformed", `Logical id '${requestedId}' is malformed.`, "/logicalId"),
    ]);
  }

  let logicalId = requestedId;
  if (existingIds.has(logicalId)) {
    if (collisionMode === "reject") {
      return fail([
        issue(
          "asset.id.collision",
          `Asset id '${logicalId}' already exists; import rejected to avoid overwrite.`,
          "/logicalId",
        ),
      ]);
    }
    const renamed = resolveCollisionId(logicalId, existingIds);
    if (!renamed) {
      return fail([
        issue(
          "asset.id.collision",
          `Could not allocate a unique id for '${logicalId}'.`,
          "/logicalId",
        ),
      ]);
    }
    logicalId = renamed;
  }

  const fileName = basenamePortable(input.sourcePath);
  let targetPath = joinRelative(assetSubdirForKind(input.kind), fileName);
  if (await fs.exists(targetPath)) {
    const stem = stemPortable(fileName);
    const ext = fileName.includes(".") ? `.${fileName.split(".").pop()}` : "";
    let index = 2;
    while (await fs.exists(targetPath)) {
      targetPath = joinRelative(assetSubdirForKind(input.kind), `${stem}.${index}${ext}`);
      index += 1;
    }
  }

  await fs.copyFile(input.sourcePath, targetPath);

  const asset = {
    id: logicalId,
    kind: input.kind,
    path: normalizeRelativePath(targetPath),
    // A new tileset cuts 16 px tiles and has no collision until tiles are assigned one.
    ...(input.kind === "tileset" && { tileSize: 16, collision: {} }),
  } as ProjectAsset;

  return succeed({ asset, copiedTo: targetPath });
}

export function mergeImportedAsset(assets: ProjectAsset[], imported: ProjectAsset): ProjectAsset[] {
  if (assets.some((asset) => asset.id === imported.id)) {
    throw new Error(`Refusing to merge asset '${imported.id}' because it already exists.`);
  }
  return [...assets, imported];
}
