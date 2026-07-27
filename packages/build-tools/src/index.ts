export {
  ASSET_PUBLIC_PREFIX,
  DATA_DIR,
  GAME_DATA_FILE,
  PROJECT_MANIFEST,
  RENDERER_BINDINGS_FILE,
  VIRTUAL_PROJECT_MODULE,
} from "./constants.js";
export { ProjectBuildError, ProjectLoadError } from "./errors.js";
export { levelDocumentToLevelData, readLevelDocument } from "./compileLevel.js";
export {
  buildProjectToDisk,
  bundleContainsAbsolutePaths,
  bundleModuleSource,
  compileBrowserProjectBundle,
  emitAssetsToDirectory,
  planAssetEmission,
} from "./compileProject.js";
export { hashContent, hashedAssetFileName } from "./contentHash.js";
export { loadProject, requireProject } from "./loadProject.js";
export {
  assertWithinProjectRoot,
  assertWithinRoot,
  resolveEmittedAssetPath,
  resolveProjectPath,
  toPortablePath,
} from "./paths.js";
export type { ResolvedEmittedAssetPath } from "./paths.js";
export type {
  AssetEmissionPlan,
  BrowserLevelBundle,
  BrowserProjectBundle,
  BrowserProjectMeta,
  DiskBuildReport,
  EmittedAsset,
  LoadedLevel,
  LoadedProject,
  LoadProjectResult,
  ProjectIssue,
} from "./types.js";
export {
  mmxProjectPlugin,
  VIRTUAL_PROJECT_MODULE as VITE_VIRTUAL_PROJECT_MODULE,
} from "./vite/plugin.js";
export type { MmxProjectPluginOptions } from "./vite/plugin.js";
