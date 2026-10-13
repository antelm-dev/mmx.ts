import type { SoundBindingMap } from "@mmx/browser-audio";
import type {
  DecorationInstance,
  ImageLayer,
  LevelDocument,
  TileLayer,
  TilesetArt,
} from "@mmx/content-schema";
import type { LevelData } from "@mmx/engine";
import type { CompiledGameData, GameData } from "@mmx/engine/data";
import type { ProjectDocument } from "@mmx/project-schema";
import type { RendererAssetBindings, RendererAssetManifest } from "@mmx/renderer-pixi";

export type LoadedLevel = {
  id: string;
  path: string;
  document: LevelDocument;
};

export type LoadedProject = {
  root: string;
  manifest: ProjectDocument;
  levels: LoadedLevel[];
  /** The engine's built-in game data with the project's `data/game.json` overlay merged in. */
  gameData: GameData;
  /** {@link gameData}, compiled; what the project's scenes run with. */
  compiledGameData: CompiledGameData;
};

export type EmittedAsset = {
  assetId: string;
  logicalPath: string;
  fileName: string;
  publicUrl: string;
  contentHash: string;
};

export type AssetEmissionPlan = {
  assets: EmittedAsset[];
  byId: Record<string, EmittedAsset>;
  byLogicalPath: Record<string, EmittedAsset>;
};

export type BrowserProjectMeta = {
  id: string;
  name: string;
  gameVersion: string;
  entryLevelId: string;
  /** project.json `player.loadout`; absent means the engine default loadout. */
  playerLoadout?: string;
};

export type BrowserLevelBundle = {
  id: string;
  name: string;
  data: LevelData;
  decorations: DecorationInstance[];
  /** Image layer textures resolve through `rendererManifest.sheetUrls[assetId]`. */
  imageLayers?: ImageLayer[];
  /** Tileset textures resolve through `rendererManifest.sheetUrls[tilesetId]`. */
  tileLayers?: TileLayer[];
  /** Level width in cells, set with `tileLayers` so the bundle level is a full `LevelArt`. */
  cols?: number;
  /** Geometry of each tileset `tileLayers` reference. */
  tilesets?: Record<string, TilesetArt>;
  backdrop?: string;
};

export type BrowserProjectBundle = {
  meta: BrowserProjectMeta;
  levels: BrowserLevelBundle[];
  /** Merged raw game data (JSON-safe); compile it at boot for `SceneOptions.gameData`. */
  gameData: GameData;
  rendererManifest: RendererAssetManifest | null;
  rendererBindings: RendererAssetBindings | null;
  soundBindings: SoundBindingMap | null;
  soundIds: string[];
  assetUrls: Record<string, string>;
};

export type { SoundBindingMap };

export type DiskBuildReport = {
  bundle: BrowserProjectBundle;
  emission: AssetEmissionPlan;
  outDir: string;
  assetFiles: string[];
};

export type ProjectIssue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  path: string;
};

export type LoadProjectResult =
  | { ok: true; value: LoadedProject; issues: ProjectIssue[] }
  | { ok: false; issues: ProjectIssue[] };
