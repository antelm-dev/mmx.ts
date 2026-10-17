import { test } from "node:test";
import assert from "node:assert/strict";

import pack from "@mmx/pack-mmx-starter/data/game.json" with { type: "json" };

import { buildCompileRegistries } from "../src/behaviors/index.js";
import {
  COMPILED_GAME_DATA,
  GAME_DATA,
  compileGameData,
  mergeGameData,
  type CompiledGameData,
  type GameData,
  type GameDataOverlay,
} from "../src/data/index.js";
import type { LevelData } from "../src/game/LevelData.js";
import { Scene } from "../src/game/Scene.js";
import { stage1, stage2 } from "./fixtures/levels.js";

/**
 * The MMX Starter pack is the built-in MMX objects as data: the base without
 * them, plus the pack, is today's game. The pack JSON is the source and the
 * engine's built-in records are checked against it, so this file fails the
 * moment either side changes without the other.
 */

const PACK = pack as GameDataOverlay;
const BUILTIN_HASH = "36e5bb6d8c3547a6";

/** GAME_DATA without any record the pack ships. */
function core(): GameData {
  const data: GameData = structuredClone(GAME_DATA);
  for (const [category, records] of Object.entries(PACK)) {
    if (category === "schemaVersion") continue;
    const table = data[category as keyof GameData] as Record<string, unknown>;
    for (const id of Object.keys(records as object)) delete table[id];
  }
  return data;
}

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

function digest(level: LevelData, gameData?: CompiledGameData): string {
  const scene = Scene.create({ level, seed: 0x5eed, ...(gameData ? { gameData } : {}) });
  assert.ok(scene.stage.enemies.length > 0, "the stage places pack enemies");
  for (const mask of INPUTS) scene.step(mask);
  return `${scene.gameDataHash}:${scene.digest()}`;
}

for (const [name, level] of [
  ["stage1", stage1],
  ["stage2", stage2],
] as const) {
  test(`${name} plays the same with core + pack as with the built-ins`, () => {
    const packData = compile(withPack());
    assert.equal(digest(level, packData), digest(level));
    assert.throws(() => Scene.create({ level, seed: 0x5eed, gameData: compile(core()) }));
  });
}
