import type { BrowserProjectBundle } from "@mmx/build-tools";
import { SoundAssetError } from "@mmx/browser-audio";
import type { SoundAssetResolver } from "@mmx/browser-audio";
import type { LevelData } from "@mmx/engine";
import { createAssetCatalog, type AssetCatalog } from "@mmx/renderer-pixi";

const DEFAULT_UI_FONT_ASSET_ID = "font.ui.mega-man-x";

export async function loadProjectBundle(): Promise<BrowserProjectBundle | null> {
  try {
    const mod = await import("virtual:mmx-project");
    return mod.default;
  } catch {
    return null;
  }
}

export function requireProjectBundle(bundle: BrowserProjectBundle | null): BrowserProjectBundle {
  if (!bundle?.rendererManifest) {
    throw new Error(
      "MMX web requires a Studio project export. " +
        "For local play run `pnpm factory:dev -- --project <dir>`. " +
        "Production builds require MMX_PROJECT (see README web project contract).",
    );
  }
  return bundle;
}

export function projectLevelCatalog(bundle: BrowserProjectBundle): readonly LevelData[] {
  return bundle.levels.map((level) => level.data);
}

export function createProjectAssetCatalog(bundle: BrowserProjectBundle): AssetCatalog {
  return createAssetCatalog({ manifest: bundle.rendererManifest! });
}

export function createProjectSoundAssetResolver(bundle: BrowserProjectBundle): SoundAssetResolver {
  return {
    resolveUrl(soundId: string): string {
      const assetId = bundle.soundBindings?.[soundId] ?? soundId;
      const url = bundle.assetUrls[assetId];
      if (!url) {
        throw new SoundAssetError(
          "missing",
          soundId,
          assetId !== soundId
            ? `Sound '${soundId}' (asset '${assetId}') is not in the project bundle.`
            : `Sound asset '${soundId}' is not in the project bundle.`,
        );
      }
      return url;
    },
  };
}

export function projectUiFontUrl(bundle: BrowserProjectBundle): string | undefined {
  return bundle.assetUrls[DEFAULT_UI_FONT_ASSET_ID];
}

export function entryLevel(bundle: BrowserProjectBundle): LevelData {
  const level = bundle.levels.find((entry) => entry.id === bundle.meta.entryLevelId);
  if (!level) {
    throw new Error(
      `Entry level '${bundle.meta.entryLevelId}' is missing from the project bundle.`,
    );
  }
  return level.data;
}

export function decorationsForLevel(
  bundle: BrowserProjectBundle,
  levelId: string,
): BrowserProjectBundle["levels"][number]["decorations"] {
  return bundle.levels.find((entry) => entry.id === levelId)?.decorations ?? [];
}
