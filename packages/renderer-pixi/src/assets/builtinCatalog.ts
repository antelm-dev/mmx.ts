/**
 * @deprecated Built-in MMX asset catalog for transitional Web consumers.
 * Remove this module in prompt 07 once apps inject project manifests.
 */
import type { AnimData } from "@mmx/contracts/animation";
import { animData, enemyAnims, pickupAnims, SHEET_URLS, shotAnims } from "../render/assets.js";
import { DECORATION_ASSETS } from "../render/decorations.js";
import type { RendererAssetManifest } from "./manifest.js";

let cachedManifest: RendererAssetManifest | null = null;

export function createBuiltinRendererAssetManifest(): RendererAssetManifest {
  if (cachedManifest) return cachedManifest;

  const manifest: RendererAssetManifest = {
    sheetUrls: { ...SHEET_URLS },
    playerAnims: animData as unknown as AnimData,
    playerSheet: "x.png",
    playerSheets: { normal: "x.png", pointing_cannon: "x_leftarm.png" },
    enemyActors: Object.fromEntries(
      Object.entries(enemyAnims.actors).map(([kind, actor]) => [kind, actor]),
    ),
    pickupActors: Object.fromEntries(
      Object.entries(pickupAnims.actors).map(([kind, actor]) => [kind, actor]),
    ),
    shotAnims,
    enemyActorIds: Object.fromEntries(
      Object.keys(enemyAnims.actors).map((kind) => [kind, `builtin.anim.enemy.${kind}`]),
    ),
    pickupActorIds: Object.fromEntries(
      Object.keys(pickupAnims.actors).map((kind) => [kind, `builtin.anim.pickup.${kind}`]),
    ),
  };
  cachedManifest = manifest;
  return manifest;
}

export function resetBuiltinRendererAssetManifestForTests(): void {
  cachedManifest = null;
}

export const BUILTIN_DECORATION_ASSETS = DECORATION_ASSETS;
