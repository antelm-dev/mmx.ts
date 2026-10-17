export {
  PROJECT_MANIFEST,
  GAME_DATA_FILE,
  LEVELS_DIR,
  ASSETS_DIR,
  PathTraversalError,
  normalizeRelativePath,
  joinRelative,
  levelManifestPath,
  assetSubdirForKind,
  basenamePortable,
  stemPortable,
  sanitizeLogicalIdCandidate,
} from "./paths.js";
export type { FileSystem, FileStat } from "./fs.js";
export {
  issue,
  fail,
  succeed,
  type ProjectIssue,
  type ProjectLevel,
  type ProjectResult,
  type ProjectPayload,
  type StudioProject,
} from "./model.js";
export {
  createProject,
  loadProject,
  saveProject,
  updateManifestAssets,
  updateLevelDocument,
  LOADOUT_IDS,
  PROJECT_VALIDATION,
  type CreateProjectInput,
} from "./project.js";
export {
  importAsset,
  mergeImportedAsset,
  type ImportAssetInput,
  type ImportAssetResult,
} from "./assets.js";
export {
  collectGameBindingAssetIds,
  collectReferencedAssetIds,
  filterReferencedAssets,
  findOrphanAssets,
} from "./references.js";
export {
  exportProject,
  exportManifestForComparison,
  type ExportProjectInput,
  type ExportProjectResult,
} from "./export.js";
export {
  mergeRects,
  sliceAuto,
  sliceGrid,
  splitRect,
  toRegions,
  type Rect,
  type SliceBackground,
  type SpriteRegion,
} from "./import/slice.js";
