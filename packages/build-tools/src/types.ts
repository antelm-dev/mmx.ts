import type { SoundBindingMap } from "@mmx/browser-audio";
import type { DecorationInstance, LevelDocument } from "@mmx/content-schema";
import type { LevelData } from "@mmx/engine";
import type { CompiledGameData } from "@mmx/engine/data";
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
};

export type BrowserLevelBundle = {
  id: string;
  name: string;
  data: LevelData;
  decorations: DecorationInstance[];
};

export type BrowserProjectBundle = {
  meta: BrowserProjectMeta;
  levels: BrowserLevelBundle[];
  compiledGameData: CompiledGameData;
  rendererManifest: RendererAssetManifest | null;
  rendererBindings: RendererAssetBindings | null;
  soundBindings: SoundBindingMap | null;
  soundIds: string[];
  soundBindings: Record<string, string>;
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
