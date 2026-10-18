import { test } from "node:test";
import assert from "node:assert/strict";

import { buildCompileRegistries } from "../src/behaviors/index.js";
import {
  COMPILED_GAME_DATA,
  GAME_DATA,
  compileGameData,
  mergeGameData,
  type CompiledGameData,
  type GameData,
} from "../src/data/index.js";
import type { LevelData, LevelEntity } from "../src/game/LevelData.js";
import { compileLevel } from "../src/game/level.js";
import { Scene } from "../src/game/Scene.js";
import { Tile } from "../src/game/World.js";
import { MMX_COMPILED, MMX_GAME_DATA, X_PACK, ZERO_PACK, withPacks } from "./support/mmx.js";

/**
 * The runtime reads every game object from the scene's game data: the engine
 * runs without the MMX objects a data pack ships, and an overlay that changes
 * one changes the game.
 */

/** The objects a data pack ships, by category — none of them is the engine's. */
const PACK_OBJECTS = {
  enemies: ["metool", "bat", "pantheon"],
  projectiles: ["pantheon_shot"],
  pickups: ["life.small", "life.large", "weapon.small", "weapon.large"],
  environments: ["moving-platform", "falling-platform", "conveyor"],
} as const;

function compile(data: GameData): CompiledGameData {
  const result = compileGameData(data, buildCompileRegistries());
  assert.ok(result.ok, JSON.stringify(result.diagnostics));
  return result.value;
}

/** Core + the player packs, without the pack objects nor the prefabs that place them. */
function withoutPackObjects(): CompiledGameData {
  const data: GameData = withPacks(structuredClone(GAME_DATA), X_PACK, ZERO_PACK);
  const removed = new Set<string>();
  for (const [category, ids] of Object.entries(PACK_OBJECTS)) {
    for (const id of ids) {
      delete (data[category as keyof typeof PACK_OBJECTS] as Record<string, unknown>)[id];
      removed.add(id);
    }
  }
  for (const [id, prefab] of Object.entries(data.prefabs)) {
    if ("ref" in prefab.source && removed.has(prefab.source.ref)) delete data.prefabs[id];
  }
  return compile(data);
}

const COLS = 40;
const ROWS = 12;
const GRID = 16;
const RIGHT = 1 << 1;

function level(entities: LevelEntity[]): LevelData {
  const tiles = new Array<Tile>(COLS * ROWS).fill(Tile.Empty);
  for (let c = 0; c < COLS; c++) tiles[(ROWS - 1) * COLS + c] = Tile.Solid;
  tiles[(ROWS - 2) * COLS + 16] = Tile.SlopeUpRight;
  return {
    identifier: "objects",
    gridSize: GRID,
    cols: COLS,
    rows: ROWS,
    tiles,
    // A shallow ramp, as a level's Slope object bakes it.
    slopes: { [(ROWS - 2) * COLS + 16]: [0, 8] },
    entities: [
      { id: "Spawn", iid: "spawn", x: 4 * GRID, y: (ROWS - 2) * GRID, w: 16, h: 16, fields: {} },
      ...entities,
    ],
  };
}

const entity = (id: string, col: number, fields: LevelEntity["fields"] = {}): LevelEntity => ({
  id,
  iid: `${id}-1`,
  x: col * GRID,
  y: (ROWS - 2) * GRID,
  w: 16,
  h: 16,
  fields,
});

const PRIMITIVES: LevelEntity[] = [
  entity("Hazard", 30),
  { ...entity("CameraZone", 0), y: 0, w: COLS * GRID, h: ROWS * GRID },
];

test("the engine runs a spawn, slope, hazard and camera-zone level without any pack object", () => {
  const gameData = withoutPackObjects();
  for (const [category, ids] of Object.entries(PACK_OBJECTS)) {
    for (const id of ids) {
      assert.equal(gameData[category as keyof typeof PACK_OBJECTS].has(id), false, id);
    }
  }

  const play = () => {
    const scene = Scene.create({ level: level(PRIMITIVES), gameData, seed: 3 });
    let died = false;
    for (let i = 0; i < 600; i++) {
      scene.step(RIGHT);
      died ||= !scene.player.has_health();
    }
    return { scene, died, digest: scene.digest() };
  };
  const run = play();
  assert.equal(run.scene.gameDataHash, gameData.hash);
  assert.equal(run.scene.stage.enemies.length, 0);
  assert.ok(run.died, "walked up the slope into the hazard");
  assert.equal(play().digest, run.digest, "deterministic");
});

test("a level placing a pack object the game data lacks fails to compile, by entity", () => {
  const result = compileLevel(
    level([
      entity("Enemy", 20, { Kind: "metool" }),
      entity("LifeCapsule", 21, { Kind: "small" }),
      entity("WeaponCapsule", 22, { Kind: "small" }),
      entity("MovingPlatform", 23),
      entity("FallingPlatform", 24),
      entity("Conveyor", 25),
    ]),
    withoutPackObjects(),
  );
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.diagnostics.map((d) => [d.code, d.entityId]),
    [
      ["enemy.kind", "Enemy-1"],
      ["pickup.kind", "LifeCapsule-1"],
      ["pickup.kind", "WeaponCapsule-1"],
      ["environment.missing", "MovingPlatform-1"],
      ["environment.missing", "FallingPlatform-1"],
      ["environment.missing", "Conveyor-1"],
    ],
  );
});

test("a capsule Kind is any pickup of the matching behaviour, drawn from its own sheet", () => {
  const data: GameData = structuredClone(MMX_GAME_DATA);
  data.pickups["life.huge"] = {
    ...data.pickups["life.large"]!,
    id: "life.huge",
    amount: 20,
    sheet: "anim.pickup.huge",
  };
  const gameData = compile(data);
  const huge = level([entity("LifeCapsule", 20, { Kind: "huge" })]);
  const scene = Scene.create({ level: huge, gameData });
  assert.equal(scene.stage.pickups[0]!.heal, 20);
  assert.equal(scene.stage.pickups[0]!.sheet, "anim.pickup.huge");
  // `weapon.huge` does not exist, and `life.small` is not a weapon pickup.
  assert.equal(
    compileLevel(level([entity("WeaponCapsule", 20, { Kind: "huge" })]), gameData).ok,
    false,
  );
  data.pickups["weapon.odd"] = { ...data.pickups["life.small"]!, id: "weapon.odd" };
  const odd = compileLevel(level([entity("WeaponCapsule", 20, { Kind: "odd" })]), compile(data));
  assert.equal(odd.diagnostics[0]?.code, "pickup.kind");
});

/** One scene with a Pantheon in range of the player, a far capsule and a far platform. */
function overlayScene(gameData: CompiledGameData) {
  const scene = Scene.create({
    level: level([
      entity("Enemy", 12, { Kind: "pantheon" }),
      entity("LifeCapsule", 36, { Kind: "small" }),
      { ...entity("MovingPlatform", 26), y: 4 * GRID, w: 32, h: 8 },
    ]),
    gameData,
  });
  const [platform] = scene.stage.platforms;
  let reach = 0;
  let shotDamage: number | undefined;
  for (let i = 0; i < 600; i++) {
    scene.step(0);
    reach = Math.max(reach, Math.abs(platform!.x - platform!.originX));
    shotDamage ??= scene.stage.enemies[0]?.projectiles[0]?.damage;
  }
  return { heal: scene.stage.pickups[0]!.heal, platform: platform!, reach, shotDamage };
}

test("an overlay changing a pickup, the moving-platform defaults and a projectile changes the game", () => {
  const merged = mergeGameData(MMX_GAME_DATA, {
    pickups: { "life.small": { ...MMX_GAME_DATA.pickups["life.small"]!, amount: 5 } },
    environments: {
      "moving-platform": {
        ...MMX_GAME_DATA.environments["moving-platform"]!,
        defaults: { travel: 10, speed: 20 },
      },
    },
    projectiles: { pantheon_shot: { ...MMX_GAME_DATA.projectiles.pantheon_shot!, damage: 5 } },
  });
  assert.ok(merged.ok, JSON.stringify(!merged.ok && merged.diagnostics));
  const gameData = compile(merged.value);
  assert.notEqual(gameData.hash, MMX_COMPILED.hash);

  const built = overlayScene(MMX_COMPILED);
  assert.equal(built.heal, 2);
  assert.deepEqual([built.platform.travel, built.platform.speed], [96, 48]);
  assert.equal(built.shotDamage, 2);

  const changed = overlayScene(gameData);
  assert.equal(changed.heal, 5);
  assert.deepEqual([changed.platform.travel, changed.platform.speed], [10, 20]);
  assert.ok(changed.reach > 0 && changed.reach <= 10, `platform reach ${changed.reach}`);
  assert.equal(changed.shotDamage, 5);
});

test("compileGameData validates pickup sheets and each environment's defaults", () => {
  const data: GameData = structuredClone(MMX_GAME_DATA);
  data.pickups["life.small"]!.sheet = "";
  data.environments["moving-platform"]!.defaults = { travel: -1, speed: 48 };
  data.environments.conveyor!.defaults = {};
  const result = compileGameData(data, buildCompileRegistries());
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.diagnostics.map((d) => [d.code, d.fieldPath]),
    [
      ["value.string", "pickups.life.small.sheet"],
      ["config.invalid", "environments.moving-platform.defaults.travel"],
      ["config.invalid", "environments.conveyor.defaults.speed"],
    ],
  );
});

// The engine's core alone (no MMX object since the pack left the engine); core + pack is pinned in pack-mmx-starter.
test("the engine's core game data hash is pinned", () => {
  assert.equal(COMPILED_GAME_DATA.hash, "ad52563298993e03");
});
