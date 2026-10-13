export const PROJECT_SCHEMA_VERSION = 1;

export const ASSET_KINDS = ["image", "sprite", "animation", "sound", "font", "tileset"] as const;
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

/**
 * A gameplay box on a frame: top-left `x, y` from the feet (the frame anchor),
 * size `w, h`, drawn as authored (frame unflipped), y down. Integers; x/y may be negative.
 */
export type FrameBox = { x: number; y: number; w: number; h: number };

export type AnimationFrame = {
  region: Region;
  duration: number;
  armRegion?: Region;
  /** Pixel in `region` drawn on the body's feet; absent keeps the fixed cell. */
  anchor?: readonly [x: number, y: number];
  /** Replaces the actor's hurtbox while this frame shows. */
  hurtbox?: FrameBox;
  /** Contact-damage volumes while this frame shows. */
  hitboxes?: FrameBox[];
};

export type AnimationClip = {
  loop: boolean;
  /** Frame a looping clip wraps back to (default 0); ignored when not looping. */
  loopStart?: number;
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
  /** Slicer output (C-REGIONS); editor-only, ignored by the engine. */
  regions?: readonly { id: string; region: Region }[];
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

/** A grid of `tileSize` squares cut row-major from one image; indices count from 0. */
export type TilesetAsset = AssetFields & {
  kind: "tileset";
  tileSize: number;
  /** Tiles per row; defaults to the image width divided by `tileSize`. */
  columns?: number;
  /** Collision type per tile index; values are `TerrainTile` numbers from `@mmx/contracts/terrain`. */
  collision: Record<number, number>;
  /** Slope profile per tile index, as [left, right] filled pixels from the tile's base. */
  slopes?: Record<number, readonly [l: number, r: number]>;
};

export type ProjectAsset =
  | ImageAsset
  | SpriteAsset
  | AnimationAsset
  | SoundAsset
  | FontAsset
  | TilesetAsset;

/** Which compiled player loadout the project plays as; absent means the engine default (`player.x`). */
export type ProjectPlayer = {
  loadout: string;
};

/**
 * A project object definition: a built-in object definition (`base`) with some
 * property values fixed (`values`) and only `exposed` properties editable per
 * instance (all of them when absent). `@mmx/content-schema` resolves it.
 */
export type ProjectObjectDefinition = {
  id: string;
  name: string;
  base: string;
  values?: Record<string, unknown>;
  exposed?: string[];
};

export type ProjectDocument = {
  schemaVersion: number;
  id: string;
  name: string;
  gameVersion: string;
  compatibleRuntime: CompatibleRuntimeRange;
  entryLevelId: string;
  levels: LevelDocumentRef[];
  assets: ProjectAsset[];
  player?: ProjectPlayer;
  objects?: ProjectObjectDefinition[];
};

export type ValidateProjectOptions = {
  /** Known compiled loadout ids; when given, `player.loadout` must be one of them. */
  loadoutIds?: Iterable<string>;
  /** Known `TerrainTile` values; when given, tileset `collision` values must be one of them. */
  terrainTiles?: Iterable<number>;
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
