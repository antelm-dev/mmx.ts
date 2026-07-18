import { World } from "./World.js";
import type { CameraZone } from "./Camera.js";
import type { LevelData, LevelEntity } from "./LevelData.js";
import type { EnemyKind } from "./Enemy.js";
import { level as stage1 } from "./levels/stage1.js";

/**
 * The playable level. Authored in LDtk (levels/stage1.ldtk) and compiled to
 * src/engine/levels/stage1.ts by `pnpm run level:import` — edit the .ldtk file
 * in LDtk and re-run that, never the generated module. levels/stage1.ascii is
 * the text form the LDtk project was bootstrapped from and the fixture the
 * import is pinned against in tests.
 *
 * At 100x32 tiles it is several screens wide and over two tall, so it is only
 * playable through the scrolling view in {@link Camera}. Three tiers, each
 * exercising a different part of the movement set:
 *
 *  - ground (rows 22-23): flat running (walk/dash) broken by three chutes, with
 *    a wall-jump shaft at cols 39-43 climbing to the upper walkway;
 *  - upper (rows 1-21): the walkway at cols 44-70 plus staggered platforms and
 *    ceiling stubs — jump/airdash, headbump, and a descent back to ground;
 *  - cavern (rows 24-29): under the ground slab, reached by falling down a
 *    chute. Ramped hills for slope traversal, and a floor-to-ceiling wall beside
 *    each chute so every region can be wall-jumped back out of (see the dead-end
 *    tests in tests/level.test.ts — obstacles down there hang from the ceiling
 *    rather than reaching the floor precisely so they never strand the player).
 */
export const LEVEL: LevelData = stage1;

export function makeWorld(): World {
  // Copied so each World owns its grid; the generated module is a shared const.
  return new World(LEVEL.tiles.slice(), LEVEL.cols, LEVEL.rows);
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
  x: e.x,
  y: e.y,
  w: e.w,
  h: e.h,
  bindX: boolField(e, "BindX", true),
  bindY: boolField(e, "BindY", true),
}));
