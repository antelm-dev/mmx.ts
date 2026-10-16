import type {
  AnimationClip,
  AnimationFrame,
  FrameBox,
  ProjectAsset,
  ProjectDocument,
  Region,
  SpriteAsset,
  TilesetAsset,
} from "./types.js";

function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function cloneRegion(region: Region): Region {
  return [region[0], region[1], region[2], region[3]];
}

function cloneBox(box: FrameBox): FrameBox {
  return { x: box.x, y: box.y, w: box.w, h: box.h };
}

function cloneFrame(frame: AnimationFrame): AnimationFrame {
  const next: AnimationFrame = {
    region: cloneRegion(frame.region),
    duration: frame.duration,
  };
  if (frame.armRegion !== undefined) {
    next.armRegion = cloneRegion(frame.armRegion);
  }
  if (frame.anchor !== undefined) {
    next.anchor = [frame.anchor[0], frame.anchor[1]];
  }
  if (frame.hurtbox !== undefined) next.hurtbox = cloneBox(frame.hurtbox);
  if (frame.hitboxes !== undefined) next.hitboxes = frame.hitboxes.map(cloneBox);
  return next;
}

function cloneClip(clip: AnimationClip): AnimationClip {
  const next: AnimationClip = {
    loop: clip.loop,
    speed: clip.speed,
    frames: clip.frames.map(cloneFrame),
  };
  if (clip.loopStart !== undefined) next.loopStart = clip.loopStart;
  return next;
}

function sortedByIndex<T>(record: Record<number, T>, clone: (value: T) => T): Record<number, T> {
  const next: Record<number, T> = {};
  for (const index of Object.keys(record).sort((a, b) => Number(a) - Number(b))) {
    next[Number(index)] = clone(record[Number(index)]!);
  }
  return next;
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
      if (asset.regions !== undefined) {
        next.regions = asset.regions.map((entry) => ({
          id: entry.id,
          region: cloneRegion(entry.region),
        }));
      }
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
    case "tileset": {
      const next: TilesetAsset = {
        id: asset.id,
        kind: "tileset",
        path: asset.path,
        tileSize: asset.tileSize,
        ...(asset.columns !== undefined ? { columns: asset.columns } : {}),
        collision: sortedByIndex(asset.collision, (tile) => tile),
      };
      if (asset.slopes !== undefined) next.slopes = sortedByIndex(asset.slopes, ([l, r]) => [l, r]);
      return next;
    }
  }
}

export function normalizeProject(project: ProjectDocument): ProjectDocument {
  // Not sorted: the level list's order is the one Studio's Levels panel shows and edits.
  const levels = project.levels.map((level) => ({ id: level.id, path: level.path }));

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
    ...(project.player !== undefined ? { player: { loadout: project.player.loadout } } : {}),
    ...(project.objects?.length
      ? {
          objects: project.objects
            .map((entry) => ({
              id: entry.id,
              name: entry.name,
              base: entry.base,
              ...(entry.values !== undefined ? { values: { ...entry.values } } : {}),
              ...(entry.exposed !== undefined ? { exposed: entry.exposed.slice() } : {}),
            }))
            .sort((a, b) => compareId(a.id, b.id)),
        }
      : {}),
  };
}

export function serializeProject(project: ProjectDocument): string {
  return `${JSON.stringify(normalizeProject(project), null, 2)}\n`;
}
