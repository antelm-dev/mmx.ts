import { assertAnimData, assertRegion, type AnimData, type Region } from "@mmx/contracts/animation";
import { assertTimedClip } from "@mmx/engine";
import type { AnimationClip, AnimationAsset, ProjectDocument } from "@mmx/project-schema";
import type { ClipActor } from "../editor/preview.js";
import { duplicateSheetKeyError, invalidAssetError } from "./errors.js";
import { createRendererAssetResolver, type RendererAssetResolver } from "./resolver.js";

export interface ShotAnimManifest {
  sheets: Record<string, string>;
  animations: Record<
    string,
    { loop: boolean; speed: number; frames: { region: Region; duration: number }[] }
  >;
}

export interface RendererAssetManifest {
  sheetUrls: Record<string, string>;
  playerAnims: AnimData;
  playerSheet: string;
  playerSheets: Record<"normal" | "pointing_cannon", string>;
  enemyActors: Record<string, ClipActor>;
  pickupActors: Record<string, ClipActor>;
  shotAnims: ShotAnimManifest;
  enemyActorIds: Record<string, string>;
  pickupActorIds: Record<string, string>;
}

export interface RendererAssetBindings {
  playerAnimation: string;
  playerSheetNormal: string;
  playerSheetPointing: string;
  enemyActors: Record<string, string>;
  pickupActors: Record<string, string>;
  shotAnimations: string;
  sheetImages: Record<string, string>;
}

export interface BuildRendererAssetManifestOptions {
  shotAnims?: ShotAnimManifest;
}

function animationSheetKey(resolver: RendererAssetResolver, asset: AnimationAsset): string {
  if (asset.sheetAssetId) return resolver.sheetKey(asset.sheetAssetId);
  return resolver.sheetKey(asset.id);
}

function animationToAnimData(asset: AnimationAsset, label: string): AnimData {
  const data: AnimData = { animations: asset.animations };
  assertAnimData(data, label);
  return data;
}

function animationToClipActor(
  resolver: RendererAssetResolver,
  assetId: string,
  asset: AnimationAsset,
): ClipActor {
  return {
    sheet: animationSheetKey(resolver, asset),
    animations: animationToAnimData(asset, `animation '${assetId}'`).animations,
  };
}

function setSheetUrl(
  sheetUrls: Record<string, string>,
  sheetOwners: Map<string, string>,
  sheetKey: string,
  imageId: string,
  url: string,
): void {
  const existingOwner = sheetOwners.get(sheetKey);
  if (existingOwner !== undefined && existingOwner !== imageId) {
    throw duplicateSheetKeyError(imageId, sheetKey, existingOwner);
  }
  const existingUrl = sheetUrls[sheetKey];
  if (existingUrl !== undefined && existingUrl !== url) {
    throw duplicateSheetKeyError(imageId, sheetKey, existingOwner ?? sheetKey);
  }
  sheetOwners.set(sheetKey, imageId);
  sheetUrls[sheetKey] = url;
}

function buildSheetUrls(
  resolver: RendererAssetResolver,
  sheetImages: Record<string, string>,
): Record<string, string> {
  const sheetUrls: Record<string, string> = {};
  const sheetOwners = new Map<string, string>();
  for (const [sheetKey, imageId] of Object.entries(sheetImages)) {
    const url = resolver.imageUrl(imageId);
    setSheetUrl(sheetUrls, sheetOwners, sheetKey, imageId, url);
  }
  return sheetUrls;
}

function buildShotAnims(
  resolver: RendererAssetResolver,
  shotAssetId: string,
  sheetUrls: Record<string, string>,
): ShotAnimManifest {
  const asset = resolver.requireKind(shotAssetId, ["animation"]);
  const sheets: Record<string, string> = {};
  const animations: ShotAnimManifest["animations"] = {};

  for (const [clipName, clip] of Object.entries(asset.animations) as [string, AnimationClip][]) {
    assertTimedClip(clip, `shot animation '${clipName}'`);
    const sheetKey = asset.sheetAssetId
      ? animationSheetKey(resolver, asset)
      : resolver.sheetKey(asset.id);
    if (!sheetUrls[sheetKey]) {
      throw invalidAssetError(
        shotAssetId,
        `shot clip '${clipName}' references unloaded sheet '${sheetKey}'.`,
      );
    }
    sheets[clipName] = sheetKey;
    animations[clipName] = clip;
    clip.frames.forEach((frame, index) =>
      assertRegion(frame.region, `shot animation '${clipName}' frame ${index} region`),
    );
  }

  return { sheets, animations };
}

export function buildRendererAssetManifest(
  resolver: RendererAssetResolver,
  bindings: RendererAssetBindings,
  options: BuildRendererAssetManifestOptions = {},
): RendererAssetManifest {
  const sheetUrls = buildSheetUrls(resolver, bindings.sheetImages);

  const playerAsset = resolver.requireKind(bindings.playerAnimation, ["animation"]);
  const playerAnims = animationToAnimData(playerAsset, `animation '${bindings.playerAnimation}'`);
  const playerSheet = resolver.sheetKey(bindings.playerSheetNormal);
  const pointingSheet = resolver.sheetKey(bindings.playerSheetPointing);
  if (!sheetUrls[playerSheet]) {
    throw invalidAssetError(
      bindings.playerSheetNormal,
      `player sheet '${playerSheet}' is not listed in sheetImages.`,
    );
  }
  if (!sheetUrls[pointingSheet]) {
    throw invalidAssetError(
      bindings.playerSheetPointing,
      `player pointing sheet '${pointingSheet}' is not listed in sheetImages.`,
    );
  }

  const enemyActors: Record<string, ClipActor> = {};
  const enemyActorIds: Record<string, string> = {};
  for (const [kind, assetId] of Object.entries(bindings.enemyActors)) {
    const asset = resolver.requireKind(assetId, ["animation"]);
    enemyActors[kind] = animationToClipActor(resolver, assetId, asset);
    enemyActorIds[kind] = assetId;
    const sheet = enemyActors[kind].sheet;
    if (!sheetUrls[sheet]) {
      throw invalidAssetError(assetId, `enemy sheet '${sheet}' is not listed in sheetImages.`);
    }
  }

  const pickupActors: Record<string, ClipActor> = {};
  const pickupActorIds: Record<string, string> = {};
  for (const [kind, assetId] of Object.entries(bindings.pickupActors)) {
    const asset = resolver.requireKind(assetId, ["animation"]);
    pickupActors[kind] = animationToClipActor(resolver, assetId, asset);
    pickupActorIds[kind] = assetId;
    const sheet = pickupActors[kind].sheet;
    if (!sheetUrls[sheet]) {
      throw invalidAssetError(assetId, `pickup sheet '${sheet}' is not listed in sheetImages.`);
    }
  }

  const shotAnims =
    options.shotAnims ?? buildShotAnims(resolver, bindings.shotAnimations, sheetUrls);

  return {
    sheetUrls,
    playerAnims,
    playerSheet,
    playerSheets: { normal: playerSheet, pointing_cannon: pointingSheet },
    enemyActors,
    pickupActors,
    shotAnims,
    enemyActorIds,
    pickupActorIds,
  };
}

export function buildRendererAssetManifestFromProject(
  project: ProjectDocument,
  bindings: RendererAssetBindings,
  resolveUrl: (asset: ProjectDocument["assets"][number]) => string,
  options: BuildRendererAssetManifestOptions = {},
): RendererAssetManifest {
  return buildRendererAssetManifest(
    createRendererAssetResolver({ assets: project.assets, resolveUrl }),
    bindings,
    options,
  );
}

export function validateRendererAssetManifest(manifest: RendererAssetManifest): void {
  assertAnimData(manifest.playerAnims, "player animations");

  for (const [name, clip] of Object.entries(manifest.shotAnims.animations)) {
    assertTimedClip(clip, `shot animation '${name}'`);
    if (!manifest.shotAnims.sheets[name]) {
      throw new Error(`shot animation '${name}' has no sheet`);
    }
    clip.frames.forEach((frame, index) =>
      assertRegion(frame.region, `shot animation '${name}' frame ${index} region`),
    );
  }

  for (const [actorName, actor] of Object.entries(manifest.enemyActors)) {
    if (!actor.sheet) throw new Error(`enemy animation '${actorName}' has no sheet`);
    assertAnimData(actor, `enemy animations '${actorName}'`);
  }

  for (const [kind, actor] of Object.entries(manifest.pickupActors)) {
    if (!actor.sheet) throw new Error(`pickup animation '${kind}' has no sheet`);
    assertAnimData(actor, `pickup animations '${kind}'`);
  }
}

export function manifestToPreviewTables(manifest: RendererAssetManifest) {
  return {
    sheetUrls: manifest.sheetUrls,
    playerAnims: manifest.playerAnims,
    playerSheet: manifest.playerSheet,
    enemyActors: manifest.enemyActors,
    pickupActors: manifest.pickupActors,
  };
}
