import type { AnimationAsset, ProjectAsset, ProjectDocument } from "@mmx/project-schema";
import {
  createRendererAssetResolver,
  type RendererAssetBindings,
  type ShotAnimManifest,
} from "@mmx/renderer-pixi";
import { ProjectBuildError } from "./errors.js";

export const STUDIO_GAME_DATA_FILE = "game/data.json";

export type StudioGameDataFile = {
  schemaVersion?: number;
  bindings: {
    playerAnimation: string;
    playerPointingSheet: string;
    fontUi?: string;
    sounds: Record<string, string>;
    enemyAnimations: Record<string, string>;
    pickupAnimations: Record<string, string>;
    shotAnimations: Record<string, string>;
    hudSprites?: Record<string, string>;
  };
};

function sheetKeyFromPath(assetPath: string): string {
  const slash = assetPath.lastIndexOf("/");
  return slash >= 0 ? assetPath.slice(slash + 1) : assetPath;
}

export function buildSheetImagesFromManifest(manifest: ProjectDocument): Record<string, string> {
  const sheetImages: Record<string, string> = {};
  for (const asset of manifest.assets) {
    if (asset.kind === "image" || asset.kind === "sprite") {
      sheetImages[sheetKeyFromPath(asset.path)] = asset.id;
    }
  }
  return sheetImages;
}

export function studioBindingsToRendererBindings(
  studio: StudioGameDataFile,
  manifest: ProjectDocument,
): RendererAssetBindings {
  const playerAnim = manifest.assets.find((asset) => asset.id === studio.bindings.playerAnimation);
  if (!playerAnim || playerAnim.kind !== "animation") {
    throw new ProjectBuildError(
      "studio.bindings",
      `Player animation '${studio.bindings.playerAnimation}' was not found in the project manifest.`,
    );
  }
  if (!playerAnim.sheetAssetId) {
    throw new ProjectBuildError(
      "studio.bindings",
      `Player animation '${studio.bindings.playerAnimation}' is missing sheetAssetId.`,
    );
  }

  const firstShotAnim = Object.values(studio.bindings.shotAnimations)[0];
  if (!firstShotAnim) {
    throw new ProjectBuildError("studio.bindings", "Studio shotAnimations bindings are empty.");
  }

  return {
    playerAnimation: studio.bindings.playerAnimation,
    playerSheetNormal: playerAnim.sheetAssetId,
    playerSheetPointing: studio.bindings.playerPointingSheet,
    enemyActors: { ...studio.bindings.enemyAnimations },
    pickupActors: { ...studio.bindings.pickupAnimations },
    shotAnimations: firstShotAnim,
    sheetImages: buildSheetImagesFromManifest(manifest),
  };
}

function resolveShotClip(asset: AnimationAsset, clipName: string) {
  const direct = asset.animations[clipName];
  if (direct) return direct;
  const first = Object.values(asset.animations)[0];
  if (!first) {
    throw new ProjectBuildError(
      "studio.bindings",
      `Shot animation asset '${asset.id}' does not define any clips.`,
    );
  }
  return first;
}

export function buildShotAnimsFromStudioBindings(
  assets: readonly ProjectAsset[],
  shotBindings: Record<string, string>,
  resolveUrl: (asset: ProjectAsset) => string,
): ShotAnimManifest {
  const resolver = createRendererAssetResolver({ assets, resolveUrl });
  const sheetUrls: Record<string, string> = {};
  for (const asset of assets) {
    if (asset.kind === "image" || asset.kind === "sprite") {
      sheetUrls[sheetKeyFromPath(asset.path)] = resolveUrl(asset);
    }
  }

  const sheets: Record<string, string> = {};
  const animations: ShotAnimManifest["animations"] = {};

  for (const [clipName, assetId] of Object.entries(shotBindings)) {
    const asset = resolver.requireKind(assetId, ["animation"]);
    const clip = resolveShotClip(asset, clipName);
    const sheetKey = asset.sheetAssetId
      ? resolver.sheetKey(asset.sheetAssetId)
      : resolver.sheetKey(assetId);
    if (!sheetUrls[sheetKey]) {
      throw new ProjectBuildError(
        "studio.bindings",
        `Shot clip '${clipName}' references unloaded sheet '${sheetKey}'.`,
      );
    }

    sheets[clipName] = sheetKey;
    animations[clipName] = clip;
  }

  return { sheets, animations };
}
