import { World } from "./World.js";
import type { CameraZone } from "./Camera.js";
import type { LevelData, LevelEntity } from "./LevelData.js";
import type { EnemyKind } from "./Enemy.js";
import type { Conveyor, Hazard, MovingPlatformSpawn } from "./Environment.js";
import { level as mechanicsDemo } from "./levels/stage2.js";

/**
 * The active mechanics demo, authored in levels/stage2.ldtk and generated into
 * levels/stage2.ts by `pnpm level:import`. Its 160x48 grid has three tiers:
 *
 *  - ground: opposing conveyors, spike strips, and three moving bridges;
 *  - upper: staggered air-dash ledges, enemies, ceilings, and a wall-jump shaft;
 *  - cavern: a safe descent and ramps ranging from 45 degrees to 1-in-4.
 *
 * The smaller Stage1 remains as the collision and movement regression fixture.
 */
export const LEVEL: LevelData = mechanicsDemo;

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
