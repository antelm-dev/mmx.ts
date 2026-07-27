import type { AssetKind, ProjectAsset } from "@mmx/project-schema";
import {
  invalidAssetError,
  invalidKindError,
  missingAssetError,
  RendererAssetError,
} from "./errors.js";

export type RendererAssetUrlResolver = (asset: ProjectAsset) => string;

export interface RendererAssetResolverContext {
  assets: readonly ProjectAsset[];
  resolveUrl: RendererAssetUrlResolver;
}

export interface RendererAssetResolver {
  readonly assets: readonly ProjectAsset[];
  get(assetId: string): ProjectAsset | undefined;
  require(assetId: string): ProjectAsset;
  requireKind<K extends AssetKind>(
    assetId: string,
    kinds: readonly K[],
  ): Extract<ProjectAsset, { kind: K }>;
  imageUrl(assetId: string): string;
  sheetKey(assetId: string): string;
}

export function assetPathBasename(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash >= 0 ? path.slice(slash + 1) : path;
}

export function createRendererAssetResolver(
  context: RendererAssetResolverContext,
): RendererAssetResolver {
  const byId = new Map<string, ProjectAsset>();
  for (const asset of context.assets) {
    if (byId.has(asset.id)) {
      throw new RendererAssetError(
        asset.id,
        "asset.duplicate_id",
        `Renderer manifest contains duplicate asset id '${asset.id}'.`,
      );
    }
    byId.set(asset.id, asset);
  }

  return {
    assets: context.assets,

    get(assetId) {
      return byId.get(assetId);
    },

    require(assetId) {
      const asset = byId.get(assetId);
      if (!asset) throw missingAssetError(assetId);
      return asset;
    },

    requireKind<K extends AssetKind>(assetId: string, kinds: readonly K[]) {
      const asset = byId.get(assetId);
      if (!asset) throw missingAssetError(assetId);
      if (!kinds.includes(asset.kind as K)) {
        throw invalidKindError(assetId, kinds, asset.kind);
      }
      return asset as Extract<ProjectAsset, { kind: K }>;
    },

    imageUrl(assetId) {
      const asset = this.requireKind(assetId, ["image", "sprite"]);
      const url = context.resolveUrl(asset);
      if (!url) {
        throw invalidAssetError(assetId, "resolveUrl returned an empty string.");
      }
      return url;
    },

    sheetKey(assetId) {
      const asset = this.require(assetId);
      if (asset.kind !== "image" && asset.kind !== "sprite" && asset.kind !== "animation") {
        throw invalidKindError(assetId, ["image", "sprite", "animation"], asset.kind);
      }
      return asset.id;
    },
  };
}
