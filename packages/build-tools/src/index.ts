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
  containAbsolutePath,
  containEmittedAssetPath,
  resolveContainedProjectPath,
  resolveEmittedAssetPath,
  resolveProjectPath,
  toPortablePath,
} from "./paths.js";
export type { ContainedPath, ResolvedEmittedAssetPath } from "./paths.js";
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
  SoundBindingMap,
} from "./types.js";
export {
  buildShotAnimsFromStudioBindings,
  compileStudioSoundBindings,
  STUDIO_GAME_DATA_FILE,
  studioBindingsToRendererBindings,
} from "./studioBindings.js";
export type { StudioGameDataFile } from "./studioBindings.js";
export {
  MMX_PROJECT_PLUGIN_NAME,
  countMmxProjectPlugins,
  createMmxProjectPluginsFromEnv,
  createMmxWebDevInlineConfig,
  defaultMmxProjectEmitDir,
  mmxProjectNullPlugin,
  mmxProjectPlugin,
  mmxProjectPluginOptionsFromDir,
  VIRTUAL_PROJECT_MODULE as VITE_VIRTUAL_PROJECT_MODULE,
} from "./vite/plugin.js";
export type { MmxProjectPluginOptions } from "./vite/plugin.js";
