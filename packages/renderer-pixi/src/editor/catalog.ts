import { assertAnimData, type AnimData, type Region } from "@mmx/asset-schema";
import {
  animData,
  enemyAnims,
  pickupAnims,
  SHEET_URLS,
  validateAnimationAssets,
} from "../render/assets.js";
import { getDecorationAsset } from "../render/decorations.js";
import { loadSheets, regionTexture } from "../render/textures.js";
import {
  createCatalog,
  type AssetCatalog,
  type AssetCatalogDeps,
  type SpritePreview,
} from "./catalogCore.js";
import type { ClipActor, EditorSpriteDefinition, PreviewTables } from "./preview.js";

export type { AssetCatalog, SpritePreview } from "./catalogCore.js";
export type { EditorSpriteDefinition } from "./preview.js";

function playerAnimData(): AnimData {
  assertAnimData(animData, "player animations");
  return animData;
}

function asClipActors(
  actors: Record<string, { sheet: string; animations: AnimData["animations"] }>,
): Record<string, ClipActor> {
  const out: Record<string, ClipActor> = {};
  for (const [name, actor] of Object.entries(actors)) {
    assertAnimData(actor, `animations '${name}'`);
    out[name] = actor;
  }
  return out;
}

function defaultTables(): PreviewTables {
  return {
    sheetUrls: SHEET_URLS,
    playerAnims: playerAnimData(),
    playerSheet: "x.png",
    enemyActors: asClipActors(enemyAnims.actors),
    pickupActors: asClipActors(pickupAnims.actors),
  };
}

function resolveDecorationCrop(
  assetId: string,
  sheetUrls: Record<string, string>,
): { imageUrl: string; region: Region; sheet: string } | null {
  const asset = getDecorationAsset(assetId);
  if (!asset) return null;
  const imageUrl = sheetUrls[asset.sheet];
  if (!imageUrl) return null;
  return { imageUrl, region: asset.region, sheet: asset.sheet };
}

function toAnimData(actor: ClipActor | AnimData, label: string): AnimData {
  assertAnimData(actor, label);
  return actor;
}

export interface CreateAssetCatalogOptions {
  tables?: PreviewTables;
  sheetUrls?: Record<string, string>;
  validate?: () => void;
  loadSheets?: (urls: Record<string, string>) => Promise<void>;
  resolveTexture?: AssetCatalogDeps["resolveTexture"];
}

export function createAssetCatalog(options: CreateAssetCatalogOptions = {}): AssetCatalog {
  const tables = options.tables ?? defaultTables();
  const sheetUrls = options.sheetUrls ?? tables.sheetUrls;
  return createCatalog({
    tables,
    sheetUrls,
    validate: options.validate ?? validateAnimationAssets,
    loadSheets: options.loadSheets ?? loadSheets,
    resolveTexture: options.resolveTexture ?? regionTexture,
    resolveDecorationCrop: (assetId) => resolveDecorationCrop(assetId, sheetUrls),
    toAnimData,
  });
}

const sharedCatalog = createAssetCatalog();

export async function loadEditorAssets(
  assets: AssetCatalog = sharedCatalog,
): Promise<AssetCatalog> {
  await assets.load();
  return assets;
}

export function getSpritePreview(
  definition: EditorSpriteDefinition,
  assets: AssetCatalog = sharedCatalog,
): SpritePreview | null {
  return assets.getSpritePreview(definition);
}

export function getDecorationPreview(
  assetId: string,
  assets: AssetCatalog = sharedCatalog,
): SpritePreview | null {
  return assets.getDecorationPreview(assetId);
}
