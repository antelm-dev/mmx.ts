import { ASSET_KINDS, PROJECT_SCHEMA_VERSION } from "./types.js";
import type {
  AnimationClip,
  AnimationFrame,
  AssetKind,
  CompatibleRuntimeRange,
  LevelDocumentRef,
  ProjectAsset,
  ProjectDocument,
  Region,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

const LOGICAL_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_.-]*$/;
const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const ASSET_KIND_SET = new Set<string>(ASSET_KINDS);

type IssueCollector = {
  issues: ValidationIssue[];
  add: (
    issue: Omit<ValidationIssue, "severity"> & { severity?: ValidationIssue["severity"] },
  ) => void;
};

function collector(): IssueCollector {
  const issues: ValidationIssue[] = [];
  return {
    issues,
    add(issue) {
      issues.push({
        severity: issue.severity ?? "error",
        code: issue.code,
        message: issue.message,
        path: issue.path,
      });
    },
  };
}

function resultOf(issues: ValidationIssue[]): ValidationResult {
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  return {
    issues,
    ok: errorCount === 0,
    errorCount,
    warningCount: issues.length - errorCount,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isLogicalId(value: string): boolean {
  return LOGICAL_ID_PATTERN.test(value);
}

export function isPortableRelativePath(value: string): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.includes("\\")) return false;
  if (value.includes("\0")) return false;
  if (/^[a-zA-Z][a-zA-Z+\-.]*:/.test(value)) return false;
  if (value.startsWith("/")) return false;
  if (/^[a-zA-Z]:/.test(value)) return false;
  if (value.startsWith("//")) return false;
  const segments = value.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) {
    return false;
  }
  return true;
}

function validateLogicalId(
  value: unknown,
  path: string,
  add: IssueCollector["add"],
): value is string {
  if (typeof value !== "string" || value.length === 0) {
    add({
      code: "id.missing",
      path,
      message: "Logical id must be a non-empty string.",
    });
    return false;
  }
  if (!isLogicalId(value)) {
    add({
      code: "id.malformed",
      path,
      message: `Logical id '${value}' is malformed; expected /${LOGICAL_ID_PATTERN.source}/.`,
    });
    return false;
  }
  return true;
}

function validatePortablePath(
  value: unknown,
  path: string,
  add: IssueCollector["add"],
): value is string {
  if (typeof value !== "string" || value.length === 0) {
    add({
      code: "path.missing",
      path,
      message: "Asset path must be a non-empty relative string.",
    });
    return false;
  }
  if (value.includes("\\")) {
    add({
      code: "path.separator",
      path,
      message: "Asset paths must use forward slashes only.",
    });
    return false;
  }
  if (/^[a-zA-Z][a-zA-Z+\-.]*:/.test(value) || value.startsWith("/") || /^[a-zA-Z]:/.test(value)) {
    add({
      code: "path.absolute",
      path,
      message: "Asset paths must be relative and portable; absolute paths are rejected.",
    });
    return false;
  }
  if (!isPortableRelativePath(value)) {
    add({
      code: "path.traversal",
      path,
      message: "Asset paths must not contain empty, '.', or '..' segments.",
    });
    return false;
  }
  return true;
}

function validateSemVer(value: unknown, path: string, add: IssueCollector["add"]): value is string {
  if (typeof value !== "string" || value.length === 0) {
    add({
      code: "version.missing",
      path,
      message: "Version must be a non-empty semver string.",
    });
    return false;
  }
  if (!SEMVER_PATTERN.test(value)) {
    add({
      code: "version.malformed",
      path,
      message: `Version '${value}' is not a valid semver string.`,
    });
    return false;
  }
  return true;
}

function compareSemVer(a: string, b: string): number {
  const parse = (value: string): number[] => {
    const core = value.split("-")[0] ?? value;
    return core.split(".").map((part) => Number(part));
  };
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < 3; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

function validateRegion(value: unknown, path: string, add: IssueCollector["add"]): value is Region {
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    !value.every((part) => Number.isInteger(part)) ||
    value[0]! < 0 ||
    value[1]! < 0 ||
    value[2]! <= 0 ||
    value[3]! <= 0
  ) {
    add({
      code: "region.invalid",
      path,
      message: "Region must be [x, y, width, height] with non-negative integers and positive size.",
    });
    return false;
  }
  return true;
}

function validateAnimationFrame(
  value: unknown,
  path: string,
  add: IssueCollector["add"],
): value is AnimationFrame {
  if (!isRecord(value)) {
    add({
      code: "animation.frame",
      path,
      message: "Animation frame must be an object.",
    });
    return false;
  }
  let ok = validateRegion(value.region, `${path}/region`, add);
  if (
    typeof value.duration !== "number" ||
    !Number.isFinite(value.duration) ||
    value.duration <= 0
  ) {
    add({
      code: "animation.duration",
      path: `${path}/duration`,
      message: "Frame duration must be a finite number greater than zero.",
    });
    ok = false;
  }
  if (value.armRegion !== undefined) {
    ok = validateRegion(value.armRegion, `${path}/armRegion`, add) && ok;
  }
  return ok;
}

function validateAnimationClip(
  value: unknown,
  path: string,
  add: IssueCollector["add"],
): value is AnimationClip {
  if (!isRecord(value)) {
    add({
      code: "animation.clip",
      path,
      message: "Animation clip must be an object.",
    });
    return false;
  }
  let ok = true;
  if (typeof value.loop !== "boolean") {
    add({
      code: "animation.loop",
      path: `${path}/loop`,
      message: "Animation clip loop must be a boolean.",
    });
    ok = false;
  }
  if (typeof value.speed !== "number" || !Number.isFinite(value.speed) || value.speed <= 0) {
    add({
      code: "animation.speed",
      path: `${path}/speed`,
      message: "Animation clip speed must be a finite number greater than zero.",
    });
    ok = false;
  }
  if (!Array.isArray(value.frames) || value.frames.length === 0) {
    add({
      code: "animation.frames",
      path: `${path}/frames`,
      message: "Animation clip must contain at least one frame.",
    });
    return false;
  }
  value.frames.forEach((frame, index) => {
    if (!validateAnimationFrame(frame, `${path}/frames/${index}`, add)) ok = false;
  });
  return ok;
}

function validateAsset(
  value: unknown,
  path: string,
  add: IssueCollector["add"],
  assetIds: Set<string>,
): value is ProjectAsset {
  if (!isRecord(value)) {
    add({
      code: "asset.object",
      path,
      message: "Asset entry must be an object.",
    });
    return false;
  }

  const assetId = value.id;
  const idOk = validateLogicalId(assetId, `${path}/id`, add);
  if (idOk) {
    if (assetIds.has(assetId)) {
      add({
        code: "asset.id.duplicate",
        path: `${path}/id`,
        message: `Duplicate asset id '${assetId}'.`,
      });
    } else {
      assetIds.add(assetId);
    }
  }

  if (typeof value.kind !== "string" || !ASSET_KIND_SET.has(value.kind)) {
    add({
      code: "asset.kind",
      path: `${path}/kind`,
      message: `Asset kind must be one of: ${ASSET_KINDS.join(", ")}.`,
    });
  }

  const pathOk = validatePortablePath(value.path, `${path}/path`, add);
  const kind = value.kind as AssetKind;

  if (kind === "sprite") {
    if (value.region !== undefined) validateRegion(value.region, `${path}/region`, add);
    if (value.anchor !== undefined) {
      if (
        !Array.isArray(value.anchor) ||
        value.anchor.length !== 2 ||
        !value.anchor.every((part) => typeof part === "number" && Number.isFinite(part))
      ) {
        add({
          code: "sprite.anchor",
          path: `${path}/anchor`,
          message: "Sprite anchor must be [x, y] finite numbers.",
        });
      }
    }
  }

  if (kind === "animation") {
    if (value.sheetAssetId !== undefined) {
      validateLogicalId(value.sheetAssetId, `${path}/sheetAssetId`, add);
    }
    if (!isRecord(value.animations) || Object.keys(value.animations).length === 0) {
      add({
        code: "animation.animations",
        path: `${path}/animations`,
        message: "Animation assets must declare a non-empty animations object.",
      });
    } else {
      for (const [clipName, clip] of Object.entries(value.animations)) {
        if (!isLogicalId(clipName)) {
          add({
            code: "animation.clipName",
            path: `${path}/animations/${clipName}`,
            message: `Animation clip name '${clipName}' is malformed.`,
          });
        }
        validateAnimationClip(clip, `${path}/animations/${clipName}`, add);
      }
    }
  }

  return idOk && pathOk && typeof value.kind === "string" && ASSET_KIND_SET.has(value.kind);
}

function validateLevelRef(
  value: unknown,
  path: string,
  add: IssueCollector["add"],
  levelIds: Set<string>,
): value is LevelDocumentRef {
  if (!isRecord(value)) {
    add({
      code: "level.object",
      path,
      message: "Level reference must be an object.",
    });
    return false;
  }
  const levelId = value.id;
  const idOk = validateLogicalId(levelId, `${path}/id`, add);
  if (idOk) {
    if (levelIds.has(levelId)) {
      add({
        code: "level.id.duplicate",
        path: `${path}/id`,
        message: `Duplicate level id '${levelId}'.`,
      });
    } else {
      levelIds.add(levelId);
    }
  }
  const pathOk = validatePortablePath(value.path, `${path}/path`, add);
  return idOk && pathOk;
}

function validateCompatibleRuntime(
  value: unknown,
  path: string,
  add: IssueCollector["add"],
): value is CompatibleRuntimeRange {
  if (!isRecord(value)) {
    add({
      code: "runtime.object",
      path,
      message: "compatibleRuntime must be an object.",
    });
    return false;
  }
  const minOk = validateSemVer(value.min, `${path}/min`, add);
  let maxOk = true;
  if (value.max !== undefined) {
    maxOk = validateSemVer(value.max, `${path}/max`, add);
    if (minOk && maxOk && compareSemVer(value.min as string, value.max as string) > 0) {
      add({
        code: "runtime.range",
        path: `${path}/max`,
        message: "compatibleRuntime.max must be greater than or equal to min.",
      });
      maxOk = false;
    }
  }
  return minOk && maxOk;
}

export function validateProject(project: ProjectDocument): ValidationResult {
  const { issues, add } = collector();

  if (project.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    add({
      code: "schema.unsupported",
      path: "/schemaVersion",
      message: `Unsupported project schemaVersion ${String(project.schemaVersion)}; expected ${PROJECT_SCHEMA_VERSION}.`,
    });
  }

  validateLogicalId(project.id, "/id", add);

  if (typeof project.name !== "string" || project.name.trim().length === 0) {
    add({
      code: "name.missing",
      path: "/name",
      message: "Project name must be a non-empty string.",
    });
  }

  validateSemVer(project.gameVersion, "/gameVersion", add);
  validateCompatibleRuntime(project.compatibleRuntime, "/compatibleRuntime", add);

  const levelIds = new Set<string>();
  if (!Array.isArray(project.levels)) {
    add({
      code: "levels.array",
      path: "/levels",
      message: "levels must be an array.",
    });
  } else if (project.levels.length === 0) {
    add({
      code: "levels.empty",
      path: "/levels",
      message: "Project must reference at least one level document.",
    });
  } else {
    project.levels.forEach((level, index) => {
      validateLevelRef(level, `/levels/${index}`, add, levelIds);
    });
  }

  if (!validateLogicalId(project.entryLevelId, "/entryLevelId", add)) {
    // already reported
  } else if (levelIds.size > 0 && !levelIds.has(project.entryLevelId)) {
    add({
      code: "entryLevel.unknown",
      path: "/entryLevelId",
      message: `entryLevelId '${project.entryLevelId}' does not match any level reference.`,
    });
  }

  const assetIds = new Set<string>();
  if (!Array.isArray(project.assets)) {
    add({
      code: "assets.array",
      path: "/assets",
      message: "assets must be an array.",
    });
  } else {
    project.assets.forEach((asset, index) => {
      validateAsset(asset, `/assets/${index}`, add, assetIds);
    });

    project.assets.forEach((asset, index) => {
      if (!isRecord(asset)) return;
      if (asset.kind !== "animation" || asset.sheetAssetId === undefined) return;

      const sheetAssetId = asset.sheetAssetId;
      if (typeof sheetAssetId !== "string" || !assetIds.has(sheetAssetId)) {
        if (typeof sheetAssetId === "string") {
          add({
            code: "animation.sheet.unknown",
            path: `/assets/${index}/sheetAssetId`,
            message: `sheetAssetId '${sheetAssetId}' does not match any asset id.`,
          });
        }
        return;
      }

      const sheet = project.assets.find(
        (entry) => isRecord(entry) && entry.id === sheetAssetId,
      );
      if (sheet && sheet.kind !== "image" && sheet.kind !== "sprite") {
        add({
          code: "animation.sheet.kind",
          path: `/assets/${index}/sheetAssetId`,
          message: `sheetAssetId '${sheetAssetId}' must reference an image or sprite asset.`,
        });
      }
    });
  }

  return resultOf(issues);
}

export function assertProject(project: ProjectDocument): asserts project is ProjectDocument {
  const result = validateProject(project);
  if (!result.ok) {
    const first = result.issues.find((issue) => issue.severity === "error");
    throw new Error(
      first
        ? `project-schema: ${first.path}: ${first.message}`
        : "project-schema: project validation failed.",
    );
  }
}
