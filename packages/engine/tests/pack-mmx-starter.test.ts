import { test } from "node:test";
import assert from "node:assert/strict";

import { buildCompileRegistries } from "../src/behaviors/index.js";
import {
  GAME_DATA,
  compileGameData,
  type CompiledGameData,
  type GameData,
} from "../src/data/index.js";
import type { LevelData, LevelEntity } from "../src/game/LevelData.js";
import { Scene } from "../src/game/Scene.js";
import { Tile } from "../src/game/World.js";
import { stage1, stage2 } from "./fixtures/levels.js";
import { MMX_PACK as PACK, X_PACK, ZERO_PACK, withPacks } from "./support/mmx.js";

/**
 * The MMX Starter pack is the MMX objects that used to be built into the engine:
 * the engine's core plus the pack (and the X and Zero packs, passed explicitly)
 * is the game as it was before they left. The
 * hash and the digests below were taken from the built-in data before the
 * removal, so a change to either side shows here.
 */

/** COMPILED_GAME_DATA.hash while the MMX objects were built in. */
const BUILTIN_HASH = "36e5bb6d8c3547a6";

const core = (): GameData => structuredClone(GAME_DATA);
/** Core + the X and Zero packs: a project without the MMX Starter pack. */
const withPlayers = (): GameData => withPacks(core(), X_PACK, ZERO_PACK);

function compile(data: GameData): CompiledGameData {
  const result = compileGameData(data, buildCompileRegistries());
  assert.ok(result.ok, JSON.stringify(result.diagnostics));
  assert.deepEqual(result.diagnostics, []);
  return result.value;
}

const withPack = (): GameData => withPacks(core(), PACK, X_PACK, ZERO_PACK);

test("core keeps only the engine's primitives", () => {
  const data = core();
  assert.deepEqual(Object.keys(data.prefabs).sort(), ["camera-zone", "hazard", "spawn"]);
  assert.deepEqual(Object.keys(data.environments).sort(), ["camera-zone", "hazard"]);
  for (const category of [
    "enemies",
    "pickups",
    "actors",
    "abilities",
    "loadouts",
    "weapons",
    "projectiles",
  ] as const) {
    assert.deepEqual(Object.keys(data[category]), [], category);
  }
});

test("core alone compiles, warning only that no player can spawn", () => {
  const result = compileGameData(core(), buildCompileRegistries());
  assert.ok(result.ok, JSON.stringify(result.diagnostics));
  assert.deepEqual(
    result.diagnostics.map((d) => [d.severity, d.code, d.fieldPath]),
    [["warning", "player.missing", "prefabs.spawn.source"]],
  );
});

test("core + MMX Starter, X and Zero packs compile to the former built-in hash", () => {
  assert.equal(compile(withPack()).hash, BUILTIN_HASH);
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
function run(level: LevelData, gameData: CompiledGameData): { scene: Scene; trace: string[] } {
  const scene = Scene.create({ level, seed: 0x5eed, gameData });
  scene.step(0);
  scene.player.current_health -= 12; // hurt (damage() is ignored in the intro), so a capsule heals
  const trace: string[] = [];
  INPUTS.forEach((mask, i) => {
    scene.step(mask);
    if (i % 60 === 59) trace.push(scene.digest());
  });
  return { scene, trace };
}

/** Each level's trace on the built-in data, recorded before the MMX objects left the engine. */
// prettier-ignore
const BUILTIN_TRACES = {
  stage1: ["812aa3d1","9e3d0c8b","9f95cd95","34a8842e","118992c8","fcd673b6","45e045e5","1dbc5df5","84d675c9","b53eebc5","5addf012","934c877e","0beecd20","79a31a29","2bd9f4d1","81f5dd20","7aaf4d13","4efc934e","26898d0b","c551fd60"],
  stage2: ["f3ba0080","4e6f5fbd","72cf7530","bfce573f","89905825","11b5d3e5","05d308d2","d664d1bf","a2933516","e2c49055","22d3ee7e","9621b1cc","1a155265","4a659ce6","ce48d3c6","89ac6542","cc8a84bb","a3c782b2","6e0c5cc3","618498f9"],
  objects: ["a4faaafb","6396abc0","edfb587c","f6430349","6eca88db","bd1da0c5","2c98e630","b42a993a","2c98fa20","f8c4006a","0e7d948a","6a96823b","9426c297","74c29e4f","1759ea9a","2062bdc8","3d94c2db","af3e8f26","a91d0ad0","09da4dc1"],
};

for (const [name, level, expected, missing] of [
  ["stage1", stage1, BUILTIN_TRACES.stage1, /Unsupported enemy kind/],
  ["stage2", stage2, BUILTIN_TRACES.stage2, /Unsupported enemy kind/],
  ["the pack-objects level", OBJECTS, BUILTIN_TRACES.objects, /Unsupported life capsule kind/],
] as const) {
  test(`${name} plays with core + pack as it did with the built-ins`, () => {
    assert.deepEqual(run(level, compile(withPack())).trace, expected);
    assert.throws(
      () => Scene.create({ level, seed: 0x5eed, gameData: compile(withPlayers()) }),
      missing,
    );
  });
}

test("the pack-objects run collects its capsule while hurt", () => {
  const { scene } = run(OBJECTS, compile(withPack()));
  assert.equal(scene.stage.pickups.length, 0, "the capsule was collected");
  assert.equal(scene.player.current_health, scene.player.max_health - 12 + 2);
});
