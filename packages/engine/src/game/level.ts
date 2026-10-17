import { World } from "./World.js";
import type { CameraZone } from "./Camera.js";
import type { LevelData, LevelEntity } from "./LevelData.js";
import { COMPILED_GAME_DATA } from "../data/index.js";
import type { CompiledGameData } from "../data/types.js";
import type {
  LifeCapsuleKind,
  LifeCapsuleSpawn,
  WeaponCapsuleKind,
  WeaponCapsuleSpawn,
} from "./Pickup.js";
import type { Conveyor, FallingPlatformSpawn, Hazard, MovingPlatformSpawn } from "./Environment.js";

export interface LevelRuntime {
  data: LevelData;
  world: World;
  spawn: { x: number; y: number };
  hazards: Hazard[];
  conveyors: Conveyor[];
  platforms: MovingPlatformSpawn[];
  fallingPlatforms: FallingPlatformSpawn[];
  enemies: EnemySpawn[];
  pickups: LifeCapsuleSpawn[];
  weaponCapsules: WeaponCapsuleSpawn[];
  cameraZones: CameraZone[];
}

/**
 * Environment entities and the game-data definition each reads its defaults from.
 * The definition must run the matching behaviour (`environment.<definition id>`).
 */
const ENVIRONMENT_DEFINITIONS: ReadonlyMap<string, string> = new Map([
  ["Conveyor", "conveyor"],
  ["MovingPlatform", "moving-platform"],
  ["FallingPlatform", "falling-platform"],
]);

/** Authored entity ids the runtime knows how to instantiate (or, for Slope, bakes upstream). */
const KNOWN_ENTITY_IDS: ReadonlySet<string> = new Set([
  "Spawn",
  "Enemy",
  "LifeCapsule",
  "WeaponCapsule",
  "MovingPlatform",
  "FallingPlatform",
  "Conveyor",
  "Hazard",
  "CameraZone",
  "Slope",
]);

// ---------------------------------------------------------------------------
// Structured compilation
// ---------------------------------------------------------------------------

/**
 * One structured problem found while compiling a level. Machine-readable
 * (`code`, `severity`) and locatable (`entityId`, `field`, `position`) so a
 * tool can render it as a clickable, jump-to-object diagnostic rather than
 * parsing a thrown string.
 *
 * The codes are chosen to line up with the authoring checks in
 * @mmx/content-schema so the editor can deduplicate the two sources.
 */
export interface EngineDiagnostic {
  severity: "error" | "warning";
  /** Stable machine-readable code, e.g. "spawn.count". */
  code: string;
  message: string;
  /** Authored {@link LevelEntity.iid} the problem concerns, when object-specific. */
  entityId?: string;
  /** Offending field name, aligned to the authoring field key (x/y/width/height/Kind/Speed…). */
  field?: string;
  /** Where the offending entity sits, for a jump-to-location affordance. */
  position?: { x: number; y: number };
}

/** Discriminated result of {@link compileLevel} — never a partial runtime on failure. */
export type CompileLevelResult =
  | { ok: true; value: LevelRuntime; diagnostics: EngineDiagnostic[] }
  | { ok: false; diagnostics: EngineDiagnostic[] };

/** Thrown by {@link loadLevel} when compilation fails, carrying every diagnostic. */
export class LevelCompileError extends Error {
  readonly diagnostics: EngineDiagnostic[];

  constructor(levelId: string, diagnostics: EngineDiagnostic[]) {
    const errors = diagnostics.filter((d) => d.severity === "error");
    super(
      `level ${levelId}: compilation failed with ${errors.length} error(s): ${errors
        .map((d) => d.message)
        .join("; ")}`,
    );
    this.name = "LevelCompileError";
    this.diagnostics = diagnostics;
  }
}

/**
 * Validate authored {@link LevelData} and, when it is sound, build the runtime
 * objects one {@link Scene} owns.
 *
 * The two are one pass on purpose: the runtime is only ever produced once every
 * error-level invariant holds, so no caller can observe a half-built level. All
 * problems — including warnings that do not block — are returned together, so a
 * tool reports the whole list rather than one-thrown-error-at-a-time.
 *
 * Enemy and capsule kinds, and the environment definitions platforms and conveyors
 * read their defaults from, are checked against `gameData`, which must be the
 * same compiled data the scene is built from.
 */
export function compileLevel(
  data: LevelData,
  gameData: CompiledGameData = COMPILED_GAME_DATA,
): CompileLevelResult {
  const diagnostics: EngineDiagnostic[] = [];
  const error = (d: Omit<EngineDiagnostic, "severity">): void => {
    diagnostics.push({ severity: "error", ...d });
  };
  const warn = (d: Omit<EngineDiagnostic, "severity">): void => {
    diagnostics.push({ severity: "warning", ...d });
  };

  // Duplicate instance ids — the runtime keys identity off iid, so collisions are fatal.
  const seenIds = new Set<string>();
  for (const e of data.entities) {
    if (seenIds.has(e.iid)) {
      error({ code: "id.duplicate", entityId: e.iid, message: `Duplicate entity id '${e.iid}'.` });
    }
    seenIds.add(e.iid);
  }

  // Exactly one Spawn.
  const spawns = data.entities.filter((e) => e.id === "Spawn");
  if (spawns.length !== 1) {
    error({ code: "spawn.count", message: `Expected exactly one Spawn, found ${spawns.length}.` });
  }

  const worldW = data.cols * data.gridSize;
  const worldH = data.rows * data.gridSize;

  const checkNumberField = (e: LevelEntity, name: string, nonNegative: boolean): void => {
    const v = e.fields[name];
    if (v === undefined || v === null) return; // absent → the runtime default applies
    const pos = { x: e.x, y: e.y };
    if (typeof v !== "number" || !Number.isFinite(v)) {
      error({
        code: "field.number",
        entityId: e.iid,
        field: name,
        message: `${e.id}: ${name} must be a finite number.`,
        position: pos,
      });
      return;
    }
    if (nonNegative && v < 0) {
      error({
        code: "field.nonNegative",
        entityId: e.iid,
        field: name,
        message: `${e.id}: ${name} must be ≥ 0.`,
        position: pos,
      });
    }
  };

  for (const e of data.entities) {
    const pos = { x: e.x, y: e.y };

    if (!KNOWN_ENTITY_IDS.has(e.id)) {
      warn({
        code: "entity.unknown",
        entityId: e.iid,
        message: `Unknown entity type '${e.id}'.`,
        position: pos,
      });
    }

    // Finite transform.
    const transform: [string, number][] = [
      ["x", e.x],
      ["y", e.y],
      ["width", e.w],
      ["height", e.h],
    ];
    for (const [field, value] of transform) {
      if (!Number.isFinite(value)) {
        error({
          code: "transform.finite",
          entityId: e.iid,
          field,
          message: `${e.id}: ${field} must be a finite number.`,
          position: pos,
        });
      }
    }

    // Positive box — a zero/negative extent collapses collision and camera zones alike.
    if (Number.isFinite(e.w) && Number.isFinite(e.h) && (!(e.w > 0) || !(e.h > 0))) {
      error({
        code: "size.positive",
        entityId: e.iid,
        field: e.w > 0 ? "height" : "width",
        message:
          e.id === "CameraZone"
            ? "Camera zone must have positive width and height."
            : `${e.id}: width and height must be positive.`,
        position: pos,
      });
    }

    // Kind support.
    if (e.id === "Enemy") {
      const kind = e.fields.Kind;
      if (typeof kind !== "string" || !gameData.enemies.has(kind)) {
        error({
          code: "enemy.kind",
          entityId: e.iid,
          field: "Kind",
          message: `Unsupported enemy kind '${String(kind)}'.`,
          position: pos,
        });
      }
    } else if (e.id === "LifeCapsule") {
      const kind = e.fields.Kind;
      if (
        typeof kind !== "string" ||
        gameData.pickups.get(`life.${kind}`)?.behavior !== "pickup.life"
      ) {
        error({
          code: "pickup.kind",
          entityId: e.iid,
          field: "Kind",
          message: `Unsupported life capsule kind '${String(kind)}'.`,
          position: pos,
        });
      }
    } else if (e.id === "WeaponCapsule") {
      const kind = e.fields.Kind;
      if (
        typeof kind !== "string" ||
        gameData.pickups.get(`weapon.${kind}`)?.behavior !== "pickup.weapon-energy"
      ) {
        error({
          code: "pickup.kind",
          entityId: e.iid,
          field: "Kind",
          message: `Unsupported weapon capsule kind '${String(kind)}'.`,
          position: pos,
        });
      }
    }
    const environment = ENVIRONMENT_DEFINITIONS.get(e.id);
    if (
      environment !== undefined &&
      gameData.environments.get(environment)?.behavior !== `environment.${environment}`
    ) {
      error({
        code: "environment.missing",
        entityId: e.iid,
        message: `${e.id}: the game data has no '${environment}' environment.`,
        position: pos,
      });
    }
    if (e.id === "Conveyor") {
      checkNumberField(e, "Speed", false);
    } else if (e.id === "MovingPlatform") {
      checkNumberField(e, "Travel", true);
      checkNumberField(e, "Speed", true);
      const axis = e.fields.Axis;
      if (axis !== undefined && axis !== null && axis !== "horizontal" && axis !== "vertical") {
        error({
          code: "field.enum",
          entityId: e.iid,
          field: "Axis",
          message: `${e.id}: Axis must be "horizontal" or "vertical".`,
          position: pos,
        });
      }
    } else if (e.id === "FallingPlatform") {
      checkNumberField(e, "Delay", true);
    }

    // Advisory: an entity that falls entirely outside the level never participates.
    if ([e.x, e.y, e.w, e.h].every(Number.isFinite)) {
      const whollyOutside = e.x + e.w <= 0 || e.x >= worldW || e.y + e.h <= 0 || e.y >= worldH;
      if (whollyOutside) {
        warn({
          code: "bounds",
          entityId: e.iid,
          message: `${e.id} lies outside the level bounds.`,
          position: pos,
        });
      }
    }
  }

  if (diagnostics.some((d) => d.severity === "error")) {
    return { ok: false, diagnostics };
  }
  return { ok: true, value: buildRuntime(data, gameData), diagnostics };
}

/** Assemble the runtime objects. Only ever called once {@link compileLevel} finds no errors. */
function buildRuntime(data: LevelData, gameData: CompiledGameData): LevelRuntime {
  const matching = (id: string): LevelEntity[] => data.entities.filter((e) => e.id === id);
  // An omitted field falls back to its environment definition's default.
  const fallback = (id: string, key: string): number =>
    gameData.environments.get(ENVIRONMENT_DEFINITIONS.get(id)!)!.defaults[key] as number;
  const spawn = matching("Spawn")[0];
  return {
    data,
    world: new World(data.tiles.slice(), data.cols, data.rows, data.slopes),
    spawn: { x: spawn.x, y: spawn.y },
    hazards: matching("Hazard").map((e) => ({ id: e.iid, x: e.x, y: e.y, w: e.w, h: e.h })),
    conveyors: matching("Conveyor").map((e) => ({
      id: e.iid,
      x: e.x,
      y: e.y,
      w: e.w,
      h: e.h,
      speed: numberField(e, "Speed", fallback("Conveyor", "speed")),
    })),
    platforms: matching("MovingPlatform").map((e) => ({
      id: e.iid,
      x: e.x,
      y: e.y,
      w: e.w,
      h: e.h,
      travel: Math.max(0, numberField(e, "Travel", fallback("MovingPlatform", "travel"))),
      speed: Math.max(0, numberField(e, "Speed", fallback("MovingPlatform", "speed"))),
      ...(e.fields.Axis === "vertical" ? { axis: "vertical" as const } : {}),
    })),
    fallingPlatforms: matching("FallingPlatform").map((e) => ({
      id: e.iid,
      x: e.x,
      y: e.y,
      w: e.w,
      h: e.h,
      delay: Math.max(0, numberField(e, "Delay", fallback("FallingPlatform", "delay"))),
    })),
    enemies: matching("Enemy").map((e) => ({
      id: e.iid,
      kind: e.fields.Kind as string,
      x: e.x,
      y: e.y,
      facing: boolField(e, "FacesRight", false) ? 1 : -1,
    })),
    pickups: matching("LifeCapsule").map((e) => ({
      id: e.iid,
      kind: e.fields.Kind as LifeCapsuleKind,
      x: e.x,
      y: e.y,
      w: e.w,
      h: e.h,
    })),
    weaponCapsules: matching("WeaponCapsule").map((e) => ({
      id: e.iid,
      kind: e.fields.Kind as WeaponCapsuleKind,
      x: e.x,
      y: e.y,
      w: e.w,
      h: e.h,
    })),
    cameraZones: matching("CameraZone").map((e) => ({
      id: e.iid,
      x: e.x,
      y: e.y,
      w: e.w,
      h: e.h,
      bindX: boolField(e, "BindX", true),
      bindY: boolField(e, "BindY", true),
    })),
  };
}

/**
 * Turn authored level data into the runtime objects owned by one scene.
 *
 * A backwards-compatible wrapper over {@link compileLevel}: it returns the same
 * runtime on success and throws a {@link LevelCompileError} carrying every
 * diagnostic on failure, rather than the ad-hoc per-callback errors it used to.
 */
export function loadLevel(
  data: LevelData,
  gameData: CompiledGameData = COMPILED_GAME_DATA,
): LevelRuntime {
  const result = compileLevel(data, gameData);
  if (!result.ok) throw new LevelCompileError(data.identifier, result.diagnostics);
  return result.value;
}

function boolField(e: LevelEntity, name: string, fallback: boolean): boolean {
  const value = e.fields[name];
  return typeof value === "boolean" ? value : fallback;
}

function numberField(e: LevelEntity, name: string, fallback: number): number {
  const value = e.fields[name];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export interface EnemySpawn {
  /** The authored entity iid, carried into the spawned enemy as its runtime identity. */
  id: string;
  /** Compiled enemy definition id ({@link CompiledGameData.enemies}). */
  kind: string;
  x: number;
  y: number;
  /** +1 / -1, as the Enemy constructor takes it. */
  facing: number;
}
