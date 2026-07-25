import { World } from "./World.js";
import type { CameraZone } from "./Camera.js";
import type { LevelData, LevelEntity } from "./LevelData.js";
import type { EnemyKind } from "./Enemy.js";
import type {
  LifeCapsuleKind,
  LifeCapsuleSpawn,
  WeaponCapsuleKind,
  WeaponCapsuleSpawn,
} from "./Pickup.js";
import type { Conveyor, Hazard, MovingPlatformSpawn } from "./Environment.js";
import { level as mechanicsDemo } from "./levels/stage2.js";
import { level as stageOne } from "./levels/stage1.js";

/**
 * The active mechanics demo, authored in levels/stage2.ldtk and generated into
 * levels/stage2.ts by `pnpm level:import`. Its 160x48 grid has three tiers:
 *
 *  - ground: conveyor runs, a spike pit, and three moving bridges;
 *  - upper: staggered air-dash ledges, enemies, ceilings, and a wall-jump shaft;
 *  - cavern: a safe descent and ramps ranging from 45 degrees to 1-in-4.
 *
 * The smaller Stage1 remains as the collision and movement regression fixture.
 */
export const LEVEL: LevelData = mechanicsDemo;

/** Levels available to player-facing clients, in menu order. */
export const LEVEL_CATALOG: readonly LevelData[] = [stageOne, mechanicsDemo];

export interface LevelRuntime {
  data: LevelData;
  world: World;
  spawn: { x: number; y: number };
  hazards: Hazard[];
  conveyors: Conveyor[];
  platforms: MovingPlatformSpawn[];
  enemies: EnemySpawn[];
  pickups: LifeCapsuleSpawn[];
  weaponCapsules: WeaponCapsuleSpawn[];
  cameraZones: CameraZone[];
}

const LIFE_CAPSULE_KINDS: readonly LifeCapsuleKind[] = ["small", "large"];
const WEAPON_CAPSULE_KINDS: readonly WeaponCapsuleKind[] = ["small", "large"];

/** Authored entity ids the runtime knows how to instantiate (or, for Slope, bakes upstream). */
const KNOWN_ENTITY_IDS: ReadonlySet<string> = new Set([
  "Spawn",
  "Enemy",
  "LifeCapsule",
  "WeaponCapsule",
  "MovingPlatform",
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
 */
export function compileLevel(data: LevelData): CompileLevelResult {
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
      if (typeof kind !== "string" || !ENEMY_KINDS.includes(kind as EnemyKind)) {
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
      if (typeof kind !== "string" || !LIFE_CAPSULE_KINDS.includes(kind as LifeCapsuleKind)) {
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
      if (typeof kind !== "string" || !WEAPON_CAPSULE_KINDS.includes(kind as WeaponCapsuleKind)) {
        error({
          code: "pickup.kind",
          entityId: e.iid,
          field: "Kind",
          message: `Unsupported weapon capsule kind '${String(kind)}'.`,
          position: pos,
        });
      }
    } else if (e.id === "Conveyor") {
      checkNumberField(e, "Speed", false);
    } else if (e.id === "MovingPlatform") {
      checkNumberField(e, "Travel", true);
      checkNumberField(e, "Speed", true);
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
  return { ok: true, value: buildRuntime(data), diagnostics };
}

/** Assemble the runtime objects. Only ever called once {@link compileLevel} finds no errors. */
function buildRuntime(data: LevelData): LevelRuntime {
  const matching = (id: string): LevelEntity[] => data.entities.filter((e) => e.id === id);
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
      speed: numberField(e, "Speed", 60),
    })),
    platforms: matching("MovingPlatform").map((e) => ({
      id: e.iid,
      x: e.x,
      y: e.y,
      w: e.w,
      h: e.h,
      travel: Math.max(0, numberField(e, "Travel", 96)),
      speed: Math.max(0, numberField(e, "Speed", 48)),
    })),
    enemies: matching("Enemy").map((e) => ({
      id: e.iid,
      kind: e.fields.Kind as EnemyKind,
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
export function loadLevel(data: LevelData): LevelRuntime {
  const result = compileLevel(data);
  if (!result.ok) throw new LevelCompileError(data.identifier, result.diagnostics);
  return result.value;
}

export function makeWorld(): World {
  // Copied so each World owns its grid; the generated module is a shared const.
  // The slope map needs no copy — World reads it into its own Map and never
  // holds the object.
  return new World(LEVEL.tiles.slice(), LEVEL.cols, LEVEL.rows, LEVEL.slopes);
}

/** All entities placed on the level's LDtk Entities layer with the given id. */
export function entities(id: string): LevelEntity[] {
  return LEVEL.entities.filter((e) => e.id === id);
}

function requireEntity(id: string): LevelEntity {
  const found = entities(id);
  if (found.length !== 1) {
    throw new Error(
      `level ${LEVEL.identifier}: expected exactly one '${id}', found ${found.length}`,
    );
  }
  return found[0];
}

/**
 * Where the player starts, in world pixels. Placed as a Spawn entity in LDtk
 * rather than hand-counted: the original constant had to be commented with why
 * column 3 was wrong (it sat under a platform with ~2px of headroom, so a jump
 * there instantly headbumped), which is exactly the mistake an editor prevents.
 */
const spawn = requireEntity("Spawn");
export const SPAWN = { x: spawn.x, y: spawn.y };

/** Read an optional LDtk boolean field, defaulting when it is absent or null. */
function boolField(e: LevelEntity, name: string, fallback: boolean): boolean {
  const v = e.fields[name];
  return typeof v === "boolean" ? v : fallback;
}

function numberField(e: LevelEntity, name: string, fallback: number): number {
  const value = e.fields[name];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Lethal volumes, conveyor strips, and moving floors authored in LDtk. */
export const HAZARDS: Hazard[] = entities("Hazard").map((e) => ({
  id: e.iid,
  x: e.x,
  y: e.y,
  w: e.w,
  h: e.h,
}));

export const CONVEYORS: Conveyor[] = entities("Conveyor").map((e) => ({
  id: e.iid,
  x: e.x,
  y: e.y,
  w: e.w,
  h: e.h,
  speed: numberField(e, "Speed", 60),
}));

export const MOVING_PLATFORM_SPAWNS: MovingPlatformSpawn[] = entities("MovingPlatform").map(
  (e) => ({
    id: e.iid,
    x: e.x,
    y: e.y,
    w: e.w,
    h: e.h,
    travel: Math.max(0, numberField(e, "Travel", 96)),
    speed: Math.max(0, numberField(e, "Speed", 48)),
  }),
);

/**
 * Where each enemy starts, in the order they were placed.
 *
 * Placed as Enemy entities in LDtk with a `Kind` field, for the same reason the
 * spawn is: an enemy's position is only meaningful relative to the geometry
 * around it — a Metool needs floor under it and headroom above, and a bat needs
 * open air to drift in — and that is a thing you check by looking, not by
 * reading coordinates.
 */
export interface EnemySpawn {
  /** The authored entity iid, carried into the spawned {@link Enemy} as its runtime identity. */
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  /** +1 / -1, as the Enemy constructor takes it (Enemy.gd spawn_direction). */
  facing: number;
}

const ENEMY_KINDS: readonly EnemyKind[] = ["metool", "bat"];

export const ENEMY_SPAWNS: EnemySpawn[] = entities("Enemy").map((e) => {
  const kind = e.fields.Kind;
  if (typeof kind !== "string" || !ENEMY_KINDS.includes(kind as EnemyKind)) {
    throw new Error(
      `level ${LEVEL.identifier}: Enemy at ${e.x},${e.y} has Kind '${String(kind)}'; expected one of ${ENEMY_KINDS.join(", ")}`,
    );
  }
  return {
    id: e.iid,
    kind: kind as EnemyKind,
    x: e.x,
    y: e.y,
    facing: boolField(e, "FacesRight", false) ? 1 : -1,
  };
});

/**
 * The level's camera zones, in the order they were placed.
 *
 * Drawn as resizable CameraZone entities on the Entities layer, which is the
 * whole point of authoring them in LDtk: a zone is a rectangle you can see
 * against the tiles it is meant to frame, and getting one wrong by a tile is
 * obvious in the editor and invisible in a table of numbers. Their BindX/BindY
 * fields default to true so a plain undecorated rectangle locks both axes.
 */
export const CAMERA_ZONES: CameraZone[] = entities("CameraZone").map((e) => ({
  id: e.iid,
  x: e.x,
  y: e.y,
  w: e.w,
  h: e.h,
  bindX: boolField(e, "BindX", true),
  bindY: boolField(e, "BindY", true),
}));
