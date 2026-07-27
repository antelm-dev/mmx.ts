import fs from "node:fs/promises";
import path from "node:path";
import { buildCompileRegistries } from "@mmx/engine/behaviors";
import { compileGameData, GAME_DATA, type GameData } from "@mmx/engine/data";
import { GAMEPLAY_SOUND_IDS, type SoundBindingMap } from "@mmx/browser-audio";
import type { ProjectAsset } from "@mmx/project-schema";
import {
  buildRendererAssetManifestFromProject,
  type RendererAssetBindings,
  type RendererAssetManifest,
} from "@mmx/renderer-pixi";
import { ASSET_PUBLIC_PREFIX, GAME_DATA_FILE, RENDERER_BINDINGS_FILE } from "./constants.js";
import {
  buildShotAnimsFromStudioBindings,
  compileStudioSoundBindings,
  STUDIO_GAME_DATA_FILE,
  studioBindingsToRendererBindings,
  type StudioGameDataFile,
} from "./studioBindings.js";
import { levelDocumentToLevelData } from "./compileLevel.js";
import { hashedAssetFileName, hashContent } from "./contentHash.js";
import { ProjectBuildError } from "./errors.js";
import { resolveProjectPath } from "./paths.js";
import type {
  AssetEmissionPlan,
  BrowserProjectBundle,
  EmittedAsset,
  LoadedProject,
} from "./types.js";

function sortAssets(assets: readonly ProjectAsset[]): ProjectAsset[] {
  return [...assets].sort((a, b) => a.id.localeCompare(b.id));
}

export async function planAssetEmission(
  project: LoadedProject,
  readBytes: (absolutePath: string) => Promise<Uint8Array> = (p) =>
    fs.readFile(p).then((b) => new Uint8Array(b)),
): Promise<AssetEmissionPlan> {
  const assets: EmittedAsset[] = [];
  const byId: Record<string, EmittedAsset> = {};
  const byLogicalPath: Record<string, EmittedAsset> = {};

  for (const asset of sortAssets(project.manifest.assets)) {
    const absolute = resolveProjectPath(project.root, asset.path);
    const bytes = await readBytes(absolute);
    const contentHash = hashContent(bytes);
    const fileName = hashedAssetFileName(contentHash, asset.path);
    const emitted: EmittedAsset = {
      assetId: asset.id,
      logicalPath: asset.path,
      fileName,
      publicUrl: `${ASSET_PUBLIC_PREFIX}${fileName}`,
      contentHash,
    };
    assets.push(emitted);
    byId[asset.id] = emitted;
    byLogicalPath[asset.path] = emitted;
  }

  return { assets, byId, byLogicalPath };
}

async function readOptionalJson<T>(absolutePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(absolutePath, "utf8");
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function loadGameData(root: string): Promise<GameData> {
  const absolute = resolveProjectPath(root, GAME_DATA_FILE);
  const authored = await readOptionalJson<GameData>(absolute);
  return authored ?? GAME_DATA;
}

type RendererBindingSource = {
  bindings: RendererAssetBindings;
  studioShotAnimations: Record<string, string> | null;
  studio: StudioGameDataFile | null;
};

async function loadRendererBindingSource(
  project: LoadedProject,
): Promise<RendererBindingSource | null> {
  const studio = await readOptionalJson<StudioGameDataFile>(
    resolveProjectPath(project.root, STUDIO_GAME_DATA_FILE),
  );

  const canonical = await readOptionalJson<RendererAssetBindings>(
    resolveProjectPath(project.root, RENDERER_BINDINGS_FILE),
  );
  if (canonical) {
    return { bindings: canonical, studioShotAnimations: null, studio };
  }

  if (!studio?.bindings) return null;

  return {
    bindings: studioBindingsToRendererBindings(studio, project.manifest),
    studioShotAnimations: studio.bindings.shotAnimations,
    studio,
  };
}

function compileAuthoredGameData(data: GameData) {
  const result = compileGameData(data, buildCompileRegistries());
  if (!result.ok) {
    const first = result.diagnostics.find((d: { severity: string }) => d.severity === "error");
    throw new ProjectBuildError(
      "gameData.compile",
      first?.message ?? "Game data compilation failed.",
    );
  }
  return result.value;
}

function compileSoundPlan(
  studio: StudioGameDataFile | null | undefined,
  manifest: LoadedProject["manifest"],
  emission: AssetEmissionPlan,
): { soundBindings: SoundBindingMap | null; soundIds: string[] } {
  const studioSounds = studio?.bindings?.sounds;
  if (studioSounds) {
    return compileStudioSoundBindings(studioSounds, manifest, emission);
  }
  return {
    soundBindings: null,
    soundIds: [...GAMEPLAY_SOUND_IDS],
  };
}

function buildRendererManifest(
  project: LoadedProject,
  emission: AssetEmissionPlan,
  bindingSource: RendererBindingSource | null,
): RendererAssetManifest | null {
  if (!bindingSource) return null;

  const resolveUrl = (asset: ProjectAsset) => emission.byId[asset.id]?.publicUrl ?? "";
  const shotAnims = bindingSource.studioShotAnimations
    ? buildShotAnimsFromStudioBindings(
        project.manifest.assets,
        bindingSource.studioShotAnimations,
        resolveUrl,
      )
    : undefined;

  return buildRendererAssetManifestFromProject(
    project.manifest,
    bindingSource.bindings,
    resolveUrl,
    shotAnims ? { shotAnims } : undefined,
  );
}

export async function compileBrowserProjectBundle(
  project: LoadedProject,
  emission: AssetEmissionPlan,
): Promise<BrowserProjectBundle> {
  const bindingSource = await loadRendererBindingSource(project);
  const gameData = await loadGameData(project.root);
  const compiledGameData = compileAuthoredGameData(gameData);
  const rendererManifest = buildRendererManifest(project, emission, bindingSource);

  const assetUrls = Object.fromEntries(
    emission.assets.map((asset) => [asset.assetId, asset.publicUrl]),
  );

  const studioForSounds =
    bindingSource?.studio ??
    (await readOptionalJson<StudioGameDataFile>(
      resolveProjectPath(project.root, STUDIO_GAME_DATA_FILE),
    ));
  const { soundBindings, soundIds } = compileSoundPlan(studioForSounds, project.manifest, emission);

  const levels = project.levels.map((level) => ({
    id: level.id,
    name: level.document.name,
    data: levelDocumentToLevelData(level.document),
    decorations: level.document.decorations.slice(),
  }));

  return {
    meta: {
      id: project.manifest.id,
      name: project.manifest.name,
      gameVersion: project.manifest.gameVersion,
      entryLevelId: project.manifest.entryLevelId,
    },
    levels,
    compiledGameData,
    rendererManifest,
    rendererBindings: bindingSource?.bindings ?? null,
    soundBindings,
    soundIds,
    assetUrls,
  };
}

export async function emitAssetsToDirectory(
  project: LoadedProject,
  emission: AssetEmissionPlan,
  outDir: string,
): Promise<string[]> {
  const assetsDir = path.join(outDir, "assets");
  await fs.mkdir(assetsDir, { recursive: true });
  const written: string[] = [];

  for (const asset of emission.assets) {
    const source = resolveProjectPath(project.root, asset.logicalPath);
    const target = path.join(assetsDir, asset.fileName);
    await fs.copyFile(source, target);
    written.push(path.relative(outDir, target).split(path.sep).join("/"));
  }

  written.sort((a, b) => a.localeCompare(b));
  return written;
}

export async function buildProjectToDisk(
  project: LoadedProject,
  outDir: string,
): Promise<{ bundle: BrowserProjectBundle; emission: AssetEmissionPlan; assetFiles: string[] }> {
  await fs.mkdir(outDir, { recursive: true });
  const emission = await planAssetEmission(project);
  const bundle = await compileBrowserProjectBundle(project, emission);
  const assetFiles = await emitAssetsToDirectory(project, emission, outDir);
  await fs.writeFile(
    path.join(outDir, "project-bundle.json"),
    `${JSON.stringify(bundle, null, 2)}\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(outDir, "asset-manifest.json"),
    `${JSON.stringify(emission, null, 2)}\n`,
    "utf8",
  );
  return { bundle, emission, assetFiles };
}

export function bundleModuleSource(bundle: BrowserProjectBundle): string {
  return `export default ${JSON.stringify(bundle)};\n`;
}

export function bundleContainsAbsolutePaths(source: string): boolean {
  return (
    /[A-Za-z]:\\/.test(source) ||
    source.includes("mmx-studio") ||
    source.includes("mmx-core-ts") ||
    source.includes(".worktrees") ||
    source.includes("Orgs/")
  );
}
