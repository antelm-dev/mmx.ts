import type { BrowserProjectBundle } from "@mmx/build-tools";
import { SoundAssetError } from "@mmx/browser-audio";
import type { SoundAssetResolver } from "@mmx/browser-audio";
import type { LevelData } from "@mmx/engine";
import { createAssetCatalog, type AssetCatalog } from "@mmx/renderer-pixi";

export async function loadProjectBundle(): Promise<BrowserProjectBundle | null> {
  try {
    const mod = await import("virtual:mmx-project");
    return mod.default;
  } catch {
    return null;
  }
}

export function projectLevelCatalog(bundle: BrowserProjectBundle): readonly LevelData[] {
  return bundle.levels.map((level) => level.data);
}

export function createProjectAssetCatalog(bundle: BrowserProjectBundle): AssetCatalog {
  if (bundle.rendererManifest) {
    return createAssetCatalog({ manifest: bundle.rendererManifest });
  }
  return createAssetCatalog();
}

export function createProjectSoundAssetResolver(bundle: BrowserProjectBundle): SoundAssetResolver {
  return {
    resolveUrl(soundId: string): string {
      const url = bundle.assetUrls[soundId];
      if (!url) {
        throw new SoundAssetError(
          "missing",
          soundId,
          `Sound asset '${soundId}' is not in the project bundle.`,
        );
      }
      return url;
    },
  };
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
