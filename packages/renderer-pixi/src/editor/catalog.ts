import { assertAnimData, type AnimData } from "@mmx/asset-schema";
import {
  animData,
  enemyAnims,
  pickupAnims,
  SHEET_URLS,
  validateAnimationAssets,
} from "../render/assets.js";
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
  return createCatalog({
    tables,
    sheetUrls: options.sheetUrls ?? tables.sheetUrls,
    validate: options.validate ?? validateAnimationAssets,
    loadSheets: options.loadSheets ?? loadSheets,
    resolveTexture: options.resolveTexture ?? regionTexture,
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
