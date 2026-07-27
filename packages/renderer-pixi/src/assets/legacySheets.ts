import {
  ambiguousSheetKeyError,
  duplicateSheetKeyError,
  invalidAssetError,
} from "./errors.js";
import { assetPathBasename, type RendererAssetResolver } from "./resolver.js";

export function adaptLegacyFilenameSheetImages(
  resolver: RendererAssetResolver,
  filenameKeyed: Record<string, string>,
): Record<string, string> {
  const basenameClaimants = new Map<string, string[]>();
  for (const asset of resolver.assets) {
    if (asset.kind !== "image" && asset.kind !== "sprite") continue;
    const base = assetPathBasename(asset.path);
    const list = basenameClaimants.get(base) ?? [];
    list.push(asset.id);
    basenameClaimants.set(base, list);
  }

  const logical: Record<string, string> = {};
  for (const [filename, imageId] of Object.entries(filenameKeyed)) {
    const asset = resolver.requireKind(imageId, ["image", "sprite"]);
    const base = assetPathBasename(asset.path);
    if (filename !== base) {
      throw invalidAssetError(
        imageId,
        `legacy sheet key '${filename}' does not match asset basename '${base}'.`,
      );
    }

    const claimants = basenameClaimants.get(base) ?? [imageId];
    if (claimants.length > 1) {
      throw ambiguousSheetKeyError(imageId, filename, claimants);
    }

    const sheetKey = resolver.sheetKey(imageId);
    const existing = logical[sheetKey];
    if (existing !== undefined && existing !== imageId) {
      throw duplicateSheetKeyError(imageId, sheetKey, existing);
    }
    logical[sheetKey] = imageId;
  }
  return logical;
}

export function adaptLegacyFilenameShotSheets<
  T extends { sheets: Record<string, string>; animations: unknown },
>(
  resolver: RendererAssetResolver,
  logicalSheetImages: Record<string, string>,
  shotAnims: T,
): T {
  const basenameToLogical = new Map<string, string>();
  for (const [sheetKey, imageId] of Object.entries(logicalSheetImages)) {
    const asset = resolver.requireKind(imageId, ["image", "sprite"]);
    const base = assetPathBasename(asset.path);
    const existing = basenameToLogical.get(base);
    if (existing !== undefined && existing !== sheetKey) {
      throw ambiguousSheetKeyError(imageId, base, [existing, sheetKey]);
    }
    basenameToLogical.set(base, sheetKey);
  }

  const sheets: Record<string, string> = {};
  for (const [clipName, sheetRef] of Object.entries(shotAnims.sheets)) {
    if (logicalSheetImages[sheetRef] !== undefined) {
      sheets[clipName] = sheetRef;
      continue;
    }
    const logical = basenameToLogical.get(sheetRef);
    if (!logical) {
      throw invalidAssetError(
        sheetRef,
        `shot clip '${clipName}' sheet '${sheetRef}' is neither a logical sheet key nor a unique basename in sheetImages.`,
      );
    }
    sheets[clipName] = logical;
  }

  return { ...shotAnims, sheets };
}
