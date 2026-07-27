import type { AssetKind } from "@mmx/project-schema";

export type RendererAssetErrorCode =
  | "asset.missing"
  | "asset.invalid_kind"
  | "asset.invalid"
  | "asset.duplicate_id";

export class RendererAssetError extends Error {
  readonly assetId: string;
  readonly code: RendererAssetErrorCode;

  constructor(assetId: string, code: RendererAssetErrorCode, message: string) {
    super(message);
    this.name = "RendererAssetError";
    this.assetId = assetId;
    this.code = code;
  }
}

export function missingAssetError(assetId: string): RendererAssetError {
  return new RendererAssetError(
    assetId,
    "asset.missing",
    `Renderer asset '${assetId}' is missing from the injected manifest.`,
  );
}

export function invalidKindError(
  assetId: string,
  expected: readonly AssetKind[],
  actual: AssetKind,
): RendererAssetError {
  const kinds = expected.join("|");
  return new RendererAssetError(
    assetId,
    "asset.invalid_kind",
    `Renderer asset '${assetId}' must be ${kinds}; received '${actual}'.`,
  );
}

export function invalidAssetError(assetId: string, detail: string): RendererAssetError {
  return new RendererAssetError(
    assetId,
    "asset.invalid",
    `Renderer asset '${assetId}' is invalid: ${detail}`,
  );
}
