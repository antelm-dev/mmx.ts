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
import { Scene } from "../src/game/Scene.js";
import { Tile } from "../src/game/World.js";
import { stage1, stage2 } from "./fixtures/levels.js";
import { MMX_PACK as PACK, coreGameData as core } from "./support/mmx.js";

/**
 * The MMX Starter pack is the built-in MMX objects as data: the base without
 * them, plus the pack, is today's game. The pack JSON is the source and the
 * engine's built-in records are checked against it, so this file fails the
 * moment either side changes without the other.
 */

const BUILTIN_HASH = "36e5bb6d8c3547a6";

function compile(data: GameData): CompiledGameData {
  const result = compileGameData(data, buildCompileRegistries());
  assert.ok(result.ok, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.diagnostics, []);
  return result.value;
}

function withPack(): GameData {
  const merged = mergeGameData(core(), PACK);
  assert.ok(merged.ok, JSON.stringify(!merged.ok && merged.diagnostics));
  return merged.value;
}

// core() drops the pack's own ids, so this exact key set is what catches a record missing from the pack.
test("core keeps only the engine's primitives, the players and their shots", () => {
  const data = core();
  assert.deepEqual(Object.keys(data.prefabs).sort(), ["camera-zone", "hazard", "spawn"]);
  assert.deepEqual(Object.keys(data.enemies), []);
  assert.deepEqual(Object.keys(data.pickups), []);
  assert.deepEqual(Object.keys(data.environments).sort(), ["camera-zone", "hazard"]);
  assert.deepEqual(Object.keys(data.actors).sort(), ["player.x", "player.zero"]);
  assert.deepEqual(Object.keys(data.projectiles).sort(), [
    "charged",
    "dark_arrow",
    "lemon",
    "medium",
  ]);
});

test("core alone compiles with no diagnostic", () => {
  compile(core());
});

test("core + MMX Starter pack is the built-in game data, same hash", () => {
  const merged = withPack();
  assert.deepStrictEqual(merged, GAME_DATA);
  const compiled = compile(merged);
  assert.deepStrictEqual(compiled, COMPILED_GAME_DATA);
  assert.equal(compiled.hash, BUILTIN_HASH);
  assert.equal(COMPILED_GAME_DATA.hash, BUILTIN_HASH);
});

const M = { right: 1 << 1, jump: 1 << 4, dash: 1 << 5, fire: 1 << 6 } as const;

/** A fixed run: walk right, hopping, dashing and firing on fixed beats. */
const INPUTS = Array.from({ length: 1200 }, (_, i) => {
  let mask = M.right;
  if (i % 90 < 20) mask |= M.jump;
  if (i % 150 >= 100 && i % 150 < 115) mask |= M.dash;
  if (i % 12 < 2) mask |= M.fire;
  return mask;
});

const GRID = 16;
/** An entity at `col`, standing on the floor (top at row 11) unless `y` is given. */
const at = (id: string, col: number, w: number, h: number, y = 11 * GRID - h): LevelEntity => ({
  id,
  iid: `${id}-${col}`,
  x: col * GRID,
  y,
  w,
  h,
  fields: {},
});

/**
 * The stages set every platform and conveyor field; here the conveyor and the
 * moving platform fall back to their pack defaults, so those show in the digest
 * too, and the run collects a Life capsule.
 */
const OBJECTS: LevelData = {
  identifier: "pack-objects",
  gridSize: GRID,
  cols: 40,
  rows: 12,
  tiles: Array.from({ length: 40 * 12 }, (_, i) => (i >= 40 * 11 ? Tile.Solid : Tile.Empty)),
  entities: [
    at("Spawn", 2, 16, 16),
    at("Conveyor", 6, 8 * GRID, 8),
    at("MovingPlatform", 20, 48, 8, 7 * GRID),
    { ...at("LifeCapsule", 18, 16, 16), fields: { Kind: "small" } },
  ],
};

/** The run's digest every 60 frames: a final digest alone misses what the right wall evens out. */
function run(level: LevelData, gameData?: CompiledGameData): { scene: Scene; trace: string[] } {
  const scene = Scene.create({ level, seed: 0x5eed, ...(gameData ? { gameData } : {}) });
  scene.step(0);
  scene.player.current_health -= 12; // hurt (damage() is ignored in the intro), so a capsule heals
  const trace: string[] = [];
  INPUTS.forEach((mask, i) => {
    scene.step(mask);
    if (i % 60 === 59) trace.push(scene.digest());
  });
  return { scene, trace };
}

for (const [name, level, missing] of [
  ["stage1", stage1, /Unsupported enemy kind/],
  ["stage2", stage2, /Unsupported enemy kind/],
  ["the pack-objects level", OBJECTS, /Unsupported life capsule kind/],
] as const) {
  test(`${name} plays the same with core + pack as with the built-ins`, () => {
    assert.deepEqual(run(level, compile(withPack())).trace, run(level).trace);
    assert.throws(() => Scene.create({ level, seed: 0x5eed, gameData: compile(core()) }), missing);
  });
}

test("the pack-objects run collects its capsule while hurt", () => {
  const { scene } = run(OBJECTS, compile(withPack()));
  assert.equal(scene.stage.pickups.length, 0, "the capsule was collected");
  assert.equal(scene.player.current_health, scene.player.max_health - 12 + 2);
});
