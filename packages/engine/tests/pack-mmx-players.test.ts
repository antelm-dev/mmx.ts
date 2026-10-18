import { test } from "node:test";
import assert from "node:assert/strict";

import xPack from "@mmx/pack-mmx-player-x/data/game.json" with { type: "json" };
import zeroPack from "@mmx/pack-mmx-player-zero/data/game.json" with { type: "json" };

import {
  GAME_DATA,
  mergeGameData,
  type GameData,
  type GameDataOverlay,
} from "../src/data/index.js";
import type { LevelData } from "../src/game/LevelData.js";
import { Scene } from "../src/game/Scene.js";
import { stage1, stage2 } from "./fixtures/levels.js";
import { MMX_PACK as STARTER, compileStrict } from "./support/mmx.js";

/**
 * The X and Zero packs are the player records that used to be built into the
 * engine. The engine's core has none left: core + Starter + X + Zero is the game
 * as it was before they left. The hash and X's digests below were taken from the
 * built-in data before the removal, so a change to either side shows here.
 */

/** COMPILED_GAME_DATA.hash of core + MMX Starter, before the players left the engine. Re-frozen when the core hazard prefab gained its Lethal and Damage fields. */
const BUILTIN_HASH = "9d8a9efb04583a0e";

const PLAYER_CATEGORIES = ["actors", "abilities", "loadouts", "weapons", "projectiles"] as const;

type Pack = { schemaVersion?: number } & Partial<Omit<GameData, "schemaVersion" | "gameVersion">>;
const X = xPack as Pack;
const ZERO = zeroPack as Pack;

/** `base` with each pack merged over it in order, as a project's overlays are. */
function withPacks(base: GameData, ...packs: Pack[]): GameData {
  return packs.reduce((data, pack) => {
    const merged = mergeGameData(data, pack as GameDataOverlay);
    assert.ok(merged.ok, JSON.stringify(!merged.ok && merged.diagnostics));
    return merged.value;
  }, base);
}

const assembled = (x: Pack = X): GameData =>
  withPacks(structuredClone(GAME_DATA), STARTER as Pack, x, ZERO);

test("core keeps no player record", () => {
  for (const category of PLAYER_CATEGORIES) assert.deepEqual(Object.keys(GAME_DATA[category]), []);
});

test("the X and Zero packs share no id", () => {
  for (const category of PLAYER_CATEGORIES) {
    const zero = new Set(Object.keys(ZERO[category] ?? {}));
    assert.deepEqual(
      Object.keys(X[category] ?? {}).filter((id) => zero.has(id)),
      [],
      category,
    );
  }
});

test("core + Starter + X + Zero compiles to the built-in hash", () => {
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

/** X's traces on the built-in data, recorded before the players left the engine. */
// prettier-ignore
const BUILTIN_TRACES = {
  stage1: ["e61aac90","79f3ea88","5ba3906d","e7859999","a5b14535","b3ae73a8","446c39d4","367cfe7a","4b885a64","27833a34","c7eb19ec","9cf6dba1","6213e104","eef7a343","b0a57442","d3f6295d","d28fdbfa","9fdbab2e","a5746e37","f052fe2a"],
  stage2: ["f7a4e1fa","83a92838","f588c2e4","16076ea3","636847a7","9f20ef1c","1239c787","693a7b07","dbf2fefa","8f85a4a0","31afffd4","a7719e11","9717f9e6","d1d2b7c4","8c0408cd","24e0326a","a7835f1a","73e46055","d1100f5a","f71975f9"],
  batAhead: ["05d22e24","79f3ea88","5ba3906d","e7859999","a5b14535","b3ae73a8","446c39d4","367cfe7a","4b885a64","27833a34","c7eb19ec","9cf6dba1","6213e104","eef7a343","b0a57442","d3f6295d","d28fdbfa","9fdbab2e","a5746e37","f052fe2a"],
};

for (const [name, level, expected] of [
  ["stage1", stage1, BUILTIN_TRACES.stage1],
  ["stage2", stage2, BUILTIN_TRACES.stage2],
] as const) {
  test(`X plays ${name} the same with the player packs as with the built-ins`, () => {
    assert.deepEqual(trace(level, assembled()), expected);
  });
}

/** stage1 with a bat (1 health, no shield) just ahead of the spawn, in the buster's line of fire. */
const BAT_AHEAD: LevelData = (() => {
  const spawn = stage1.entities.find((e) => e.id === "Spawn")!;
  const metool = stage1.entities.find((e) => e.id === "Enemy")!;
  const bat = { ...metool, iid: "sentinel-bat", x: spawn.x + 96, y: spawn.y - 8 };
  return {
    ...stage1,
    entities: [...stage1.entities, { ...bat, fields: { ...bat.fields, Kind: "bat" } }],
  };
})();

test("the equivalence reads the X pack's shots: a harmless lemon changes X's digests", () => {
  const x = structuredClone(X);
  x.projectiles!.lemon!.damage = 0;
  assert.deepEqual(trace(BAT_AHEAD, assembled()), BUILTIN_TRACES.batAhead);
  assert.notDeepEqual(trace(BAT_AHEAD, assembled(x)), BUILTIN_TRACES.batAhead);
});

test("a project overlay that changes a weapon changes the game", () => {
  const base = assembled();
  const merged = mergeGameData(base, {
    weapons: { buster: { ...base.weapons.buster!, maxLiveShots: 1 } },
  });
  assert.ok(merged.ok);
  assert.notDeepEqual(trace(stage1, merged.value), trace(stage1, base));
});
