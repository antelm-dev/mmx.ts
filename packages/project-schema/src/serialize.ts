import type {
  AnimationClip,
  AnimationFrame,
  ProjectAsset,
  ProjectDocument,
  Region,
  SpriteAsset,
} from "./types.js";

function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function cloneRegion(region: Region): Region {
  return [region[0], region[1], region[2], region[3]];
}

function cloneFrame(frame: AnimationFrame): AnimationFrame {
  const next: AnimationFrame = {
    region: cloneRegion(frame.region),
    duration: frame.duration,
  };
  if (frame.armRegion !== undefined) {
    next.armRegion = cloneRegion(frame.armRegion);
  }
  return next;
}

function cloneClip(clip: AnimationClip): AnimationClip {
  return {
    loop: clip.loop,
    speed: clip.speed,
    frames: clip.frames.map(cloneFrame),
  };
}

function normalizeAsset(asset: ProjectAsset): ProjectAsset {
  switch (asset.kind) {
    case "image":
      return { id: asset.id, kind: "image", path: asset.path };
    case "sound":
      return { id: asset.id, kind: "sound", path: asset.path };
    case "font":
      return { id: asset.id, kind: "font", path: asset.path };
    case "sprite": {
      const next: SpriteAsset = { id: asset.id, kind: "sprite", path: asset.path };
      if (asset.region !== undefined) next.region = cloneRegion(asset.region);
      if (asset.anchor !== undefined) next.anchor = [asset.anchor[0], asset.anchor[1]];
      return next;
    }
    case "animation": {
      const animations: Record<string, AnimationClip> = {};
      for (const name of Object.keys(asset.animations).sort(compareId)) {
        animations[name] = cloneClip(asset.animations[name]!);
      }
      return {
        id: asset.id,
        kind: "animation",
        path: asset.path,
        ...(asset.sheetAssetId !== undefined ? { sheetAssetId: asset.sheetAssetId } : {}),
        animations,
      };
    }
  }
}

export function normalizeProject(project: ProjectDocument): ProjectDocument {
  const levels = project.levels
    .map((level) => ({ id: level.id, path: level.path }))
    .sort((a, b) => compareId(a.id, b.id));

  const assets = project.assets.map(normalizeAsset).sort((a, b) => compareId(a.id, b.id));

  return {
    schemaVersion: project.schemaVersion,
    id: project.id,
    name: project.name,
    gameVersion: project.gameVersion,
    compatibleRuntime: {
      min: project.compatibleRuntime.min,
      ...(project.compatibleRuntime.max !== undefined
        ? { max: project.compatibleRuntime.max }
        : {}),
    },
    entryLevelId: project.entryLevelId,
    levels,
    assets,
  };
}

export function serializeProject(project: ProjectDocument): string {
  return `${JSON.stringify(normalizeProject(project), null, 2)}\n`;
}
