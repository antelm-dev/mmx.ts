import type { LevelDocument } from "@mmx/content-schema";
import type { ProjectAsset, ProjectDocument } from "@mmx/project-schema";

export function collectGameBindingAssetIds(gameData: {
  bindings?: Record<string, unknown>;
}): Set<string> {
  const ids = new Set<string>();
  const bindings = gameData.bindings;
  if (!bindings || typeof bindings !== "object") return ids;

  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      ids.add(value);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const entry of Object.values(value)) visit(entry);
  };

  visit(bindings);
  return ids;
}

export function collectReferencedAssetIds(
  manifest: ProjectDocument,
  levels: LevelDocument[],
  extraIds: Iterable<string> = [],
): Set<string> {
  const referenced = new Set<string>();

  for (const id of extraIds) referenced.add(id);

  for (const level of levels) {
    for (const decoration of level.decorations) {
      if (decoration.assetId) referenced.add(decoration.assetId);
    }
  }

  const assetsById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const queue = [...referenced];
  while (queue.length > 0) {
    const id = queue.pop()!;
    const asset = assetsById.get(id);
    if (!asset) continue;
    if (asset.kind === "animation" && asset.sheetAssetId) {
      if (!referenced.has(asset.sheetAssetId)) {
        referenced.add(asset.sheetAssetId);
        queue.push(asset.sheetAssetId);
      }
    }
  }

  return referenced;
}

export function filterReferencedAssets(
  manifest: ProjectDocument,
  levels: LevelDocument[],
  extraIds: Iterable<string> = [],
): ProjectAsset[] {
  const referenced = collectReferencedAssetIds(manifest, levels, extraIds);
  return manifest.assets.filter((asset) => referenced.has(asset.id));
}

export function findOrphanAssets(
  manifest: ProjectDocument,
  levels: LevelDocument[],
  extraIds: Iterable<string> = [],
): ProjectAsset[] {
  const referenced = collectReferencedAssetIds(manifest, levels, extraIds);
  return manifest.assets.filter((asset) => !referenced.has(asset.id));
}
