import {
  collectBoundAssetIds,
  GAMEPLAY_SOUND_IDS,
  type SoundBindingMap,
} from "@mmx/browser-audio";
import type { AnimationAsset, ProjectAsset, ProjectDocument } from "@mmx/project-schema";
import {
  createRendererAssetResolver,
  type RendererAssetBindings,
  type ShotAnimManifest,
} from "@mmx/renderer-pixi";
import { ProjectBuildError } from "./errors.js";
import type { AssetEmissionPlan } from "./types.js";

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

function validateSoundBindingTarget(
  runtimeName: string,
  assetId: string,
  manifest: ProjectDocument,
  emission: AssetEmissionPlan,
): void {
  if (!assetId) {
    throw new ProjectBuildError(
      "studio.bindings.sounds",
      `Sound binding '${runtimeName}' → '${assetId}' is empty.`,
    );
  }

  const asset = manifest.assets.find((entry) => entry.id === assetId);
  if (!asset) {
    throw new ProjectBuildError(
      "studio.bindings.sounds",
      `Sound binding '${runtimeName}' → '${assetId}' target asset was not found in the project manifest.`,
    );
  }
  if (asset.kind !== "sound") {
    throw new ProjectBuildError(
      "studio.bindings.sounds",
      `Sound binding '${runtimeName}' → '${assetId}' has kind '${asset.kind}'; expected 'sound'.`,
    );
  }
  if (!emission.byId[assetId]?.publicUrl) {
    throw new ProjectBuildError(
      "studio.bindings.sounds",
      `Sound binding '${runtimeName}' → '${assetId}' has no emitted URL.`,
    );
  }
}

export function compileStudioSoundBindings(
  studioSounds: Record<string, string>,
  manifest: ProjectDocument,
  emission: AssetEmissionPlan,
): { soundBindings: SoundBindingMap; soundIds: string[] } {
  for (const runtimeName of GAMEPLAY_SOUND_IDS) {
    const assetId = studioSounds[runtimeName];
    if (assetId === undefined) {
      throw new ProjectBuildError(
        "studio.bindings.sounds",
        `Required gameplay sound '${runtimeName}' is missing from studio.bindings.sounds (expected a logical asset ID).`,
      );
    }
    validateSoundBindingTarget(runtimeName, assetId, manifest, emission);
  }

  for (const [runtimeName, assetId] of Object.entries(studioSounds)) {
    if ((GAMEPLAY_SOUND_IDS as readonly string[]).includes(runtimeName)) continue;
    validateSoundBindingTarget(runtimeName, assetId, manifest, emission);
  }

  const soundBindings: SoundBindingMap = { ...studioSounds };
  return {
    soundBindings,
    soundIds: collectBoundAssetIds(soundBindings),
  };
}
