import { assertAnimData, type AnimData, type Region } from "@mmx/contracts/animation";
import {
  buildRendererAssetManifest,
  manifestToPreviewTables,
  validateRendererAssetManifest,
  type RendererAssetBindings,
  type RendererAssetManifest,
} from "../assets/manifest.js";
import type { RendererAssetResolver } from "../assets/resolver.js";
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

function toAnimData(actor: ClipActor | AnimData, label: string): AnimData {
  assertAnimData(actor, label);
  return actor;
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

export interface CreateAssetCatalogOptions {
  manifest?: RendererAssetManifest;
  resolver?: RendererAssetResolver;
  bindings?: RendererAssetBindings;
  tables?: PreviewTables;
  sheetUrls?: Record<string, string>;
  validate?: () => void;
  loadSheets?: (urls: Record<string, string>) => Promise<void>;
  resolveTexture?: AssetCatalogDeps["resolveTexture"];
}

export function resolveRendererAssetManifest(
  options: Pick<CreateAssetCatalogOptions, "manifest" | "resolver" | "bindings"> = {},
): RendererAssetManifest {
  if (options.manifest) return options.manifest;
  if (options.resolver && options.bindings) {
    return buildRendererAssetManifest(options.resolver, options.bindings);
  }
  throw new Error("Renderer assets require an injected manifest or resolver/bindings pair.");
}

export function createAssetCatalog(options: CreateAssetCatalogOptions = {}): AssetCatalog {
  const manifest = resolveRendererAssetManifest(options);
  const tables = options.tables ?? manifestToPreviewTables(manifest);
  const sheetUrls = options.sheetUrls ?? tables.sheetUrls;
  return createCatalog({
    tables,
    sheetUrls,
    validate: options.validate ?? (() => validateRendererAssetManifest(manifest)),
    loadSheets: options.loadSheets ?? loadSheets,
    resolveTexture: options.resolveTexture ?? regionTexture,
    resolveDecorationCrop: (assetId) => resolveDecorationCrop(assetId, sheetUrls),
    toAnimData,
    enemyActorIds: manifest.enemyActorIds,
    pickupActorIds: manifest.pickupActorIds,
  });
}

export async function loadEditorAssets(assets: AssetCatalog): Promise<AssetCatalog> {
  await assets.load();
  return assets;
}

export function getSpritePreview(
  definition: EditorSpriteDefinition,
  assets: AssetCatalog,
): SpritePreview | null {
  return assets.getSpritePreview(definition);
}

export function getDecorationPreview(assetId: string, assets: AssetCatalog): SpritePreview | null {
  return assets.getDecorationPreview(assetId);
}
