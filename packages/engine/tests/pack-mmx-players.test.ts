import { test } from "node:test";
import assert from "node:assert/strict";

import xPack from "@mmx/pack-mmx-player-x/data/game.json" with { type: "json" };
import zeroPack from "@mmx/pack-mmx-player-zero/data/game.json" with { type: "json" };

import { GAME_DATA, type GameData } from "../src/data/index.js";
import type { LevelData } from "../src/game/LevelData.js";
import { Scene } from "../src/game/Scene.js";
import { stage1, stage2 } from "./fixtures/levels.js";
import { MMX_GAME_DATA, MMX_PACK as STARTER, compileStrict } from "./support/mmx.js";

/**
 * The X and Zero packs are the player records still built into the engine: core
 * without them plus both packs is the built-in data, value for value. The packs
 * are the source; this test keeps the built-ins aligned until phase 2 removes them.
 */

/** COMPILED_GAME_DATA.hash of core + MMX Starter, before the players left the engine. */
const BUILTIN_HASH = "36e5bb6d8c3547a6";

const PLAYER_CATEGORIES = ["actors", "abilities", "loadouts", "weapons", "projectiles"] as const;

type Pack = { schemaVersion?: number } & Partial<Omit<GameData, "schemaVersion" | "gameVersion">>;
const X = xPack as Pack;
const ZERO = zeroPack as Pack;

/** GAME_DATA minus every record the X and Zero packs ship. */
function coreWithoutPlayers(): GameData {
  const data = structuredClone(GAME_DATA);
  for (const pack of [X, ZERO]) {
    for (const category of PLAYER_CATEGORIES) {
      for (const id of Object.keys(pack[category] ?? {})) delete data[category][id];
    }
  }
  return data;
}

// shortcut: a plain per-category spread, as the overlay rejects abilities, loadouts and
// weapons; move to mergeGameData once it accepts them (task 03).
function withPacks(base: GameData, ...packs: Pack[]): GameData {
  const data: Record<string, unknown> = { ...base };
  for (const { schemaVersion, ...categories } of packs) {
    assert.equal(schemaVersion, base.schemaVersion);
    for (const [category, records] of Object.entries(categories)) {
      data[category] = { ...(data[category] as object), ...records };
    }
  }
  return data as GameData;
}

const assembled = (): GameData => withPacks(coreWithoutPlayers(), STARTER as Pack, X, ZERO);

test("core without the players keeps no player record", () => {
  const core = coreWithoutPlayers();
  for (const category of PLAYER_CATEGORIES) assert.deepEqual(Object.keys(core[category]), []);
});

test("core without the players + X + Zero is GAME_DATA", () => {
  assert.deepStrictEqual(withPacks(coreWithoutPlayers(), X, ZERO), GAME_DATA);
});

test("core without the players + Starter + X + Zero is core + Starter", () => {
  assert.deepStrictEqual(assembled(), MMX_GAME_DATA);
});

test("core without the players + Starter + X + Zero compiles to the built-in hash", () => {
  assert.equal(compileStrict(assembled()).hash, BUILTIN_HASH);
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

/** X's digest every 60 frames. */
function trace(level: LevelData, gameData: GameData): string[] {
  const scene = Scene.create({ level, seed: 0x5eed, gameData: compileStrict(gameData) });
  scene.step(0);
  const out: string[] = [];
  INPUTS.forEach((mask, i) => {
    scene.step(mask);
    if (i % 60 === 59) out.push(scene.digest());
  });
  return out;
}

for (const [name, level] of [
  ["stage1", stage1],
  ["stage2", stage2],
] as const) {
  test(`X plays ${name} the same with the player packs as with the built-ins`, () => {
    assert.deepEqual(trace(level, assembled()), trace(level, MMX_GAME_DATA));
  });
}
