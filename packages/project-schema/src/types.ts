export const PROJECT_SCHEMA_VERSION = 1;

export const ASSET_KINDS = ["image", "sprite", "animation", "sound", "font"] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export type Region = readonly [x: number, y: number, width: number, height: number];

export type CompatibleRuntimeRange = {
  min: string;
  max?: string;
};

export type LevelDocumentRef = {
  id: string;
  path: string;
};

export type AnimationFrame = {
  region: Region;
  duration: number;
  armRegion?: Region;
};

export type AnimationClip = {
  loop: boolean;
  speed: number;
  frames: AnimationFrame[];
};

type AssetFields = {
  id: string;
  path: string;
};

export type ImageAsset = AssetFields & {
  kind: "image";
};

export type SpriteAsset = AssetFields & {
  kind: "sprite";
  region?: Region;
  anchor?: readonly [number, number];
};

export type AnimationAsset = AssetFields & {
  kind: "animation";
  sheetAssetId?: string;
  animations: Record<string, AnimationClip>;
};

export type SoundAsset = AssetFields & {
  kind: "sound";
};

export type FontAsset = AssetFields & {
  kind: "font";
};

export type ProjectAsset =
  | ImageAsset
  | SpriteAsset
  | AnimationAsset
  | SoundAsset
  | FontAsset;

export type ProjectDocument = {
  schemaVersion: number;
  id: string;
  name: string;
  gameVersion: string;
  compatibleRuntime: CompatibleRuntimeRange;
  entryLevelId: string;
  levels: LevelDocumentRef[];
  assets: ProjectAsset[];
};

export type Severity = "error" | "warning";

export type ValidationIssue = {
  severity: Severity;
  code: string;
  message: string;
  path: string;
};

export type ValidationResult = {
  issues: ValidationIssue[];
  ok: boolean;
  errorCount: number;
  warningCount: number;
};

export type ParseProjectResult =
  | {
      ok: true;
      project: ProjectDocument;
      issues: ValidationIssue[];
      errorCount: 0;
      warningCount: number;
    }
  | {
      ok: false;
      project?: ProjectDocument;
      issues: ValidationIssue[];
      errorCount: number;
      warningCount: number;
    };
