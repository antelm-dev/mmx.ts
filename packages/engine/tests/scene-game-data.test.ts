import { test } from "node:test";
import assert from "node:assert/strict";

import { buildCompileRegistries } from "../src/behaviors/index.js";
import { decodeReplay, encodeReplay } from "../src/core/Replay.js";
import {
  COMPILED_GAME_DATA,
  compileGameData,
  type CompiledGameData,
  type GameData,
} from "../src/data/index.js";
import type { LevelData, LevelEntity } from "../src/game/LevelData.js";
import { compileLevel } from "../src/game/level.js";
import { Recorder } from "../src/game/Recorder.js";
import { Scene } from "../src/game/Scene.js";
import { Tile } from "../src/game/World.js";
import { MMX_COMPILED, MMX_GAME_DATA } from "./support/mmx.js";

/**
 * A scene is a function of (level, game data, seed): enemy kinds resolve against
 * the game data the scene was given, and replays refuse to cross it.
 */

/** The MMX data plus a "crab": a Metool body that only patrols. */
function crabData(): CompiledGameData {
  const data: GameData = structuredClone(MMX_GAME_DATA);
  data.enemies.crab = {
    ...data.enemies.metool,
    id: "crab",
    sheet: "crab",
    shield: undefined,
    abilities: ["Patrol", "Death"],
    abilityConfig: {
      Patrol: { travelSpeed: 60, travelTime: 0.8, restMin: 0.8, randomTurn: false, conflicts: [] },
      Death: { explosionDuration: 0 },
    },
    reactions: { idle: ["Patrol"] },
  };
  const compiled = compileGameData(data, buildCompileRegistries());
  assert.ok(compiled.ok, JSON.stringify(compiled.diagnostics));
  return compiled.value;
}

const COLS = 40;
const ROWS = 12;
const GRID = 16;

function level(entities: LevelEntity[]): LevelData {
  const tiles = new Array<Tile>(COLS * ROWS).fill(Tile.Empty);
  for (let c = 0; c < COLS; c++) tiles[(ROWS - 1) * COLS + c] = Tile.Solid;
  return {
    identifier: "crab-room",
    gridSize: GRID,
    cols: COLS,
    rows: ROWS,
    tiles,
    entities: [
      { id: "Spawn", iid: "spawn", x: 32, y: (ROWS - 2) * GRID, w: 16, h: 16, fields: {} },
      ...entities,
    ],
  };
}

const CRAB: LevelEntity = {
  id: "Enemy",
  iid: "crab-1",
  x: 30 * GRID,
  y: (ROWS - 2) * GRID,
  w: 16,
  h: 16,
  fields: { Kind: "crab" },
};

test("a scene spawns an enemy kind defined only in its game data", () => {
  const gameData = crabData();
  const scene = Scene.create({ level: level([CRAB]), gameData });
  assert.equal(scene.gameDataHash, gameData.hash);
  assert.notEqual(scene.gameDataHash, MMX_COMPILED.hash);

  const [crab] = scene.stage.enemies;
  assert.equal(crab.kind, "crab");
  assert.equal(crab.sourceEntityId, "crab-1");
  const x0 = crab.pos.x;
  for (let i = 0; i < 30; i++) scene.step(0);
  assert.notEqual(crab.pos.x, x0, "the crab patrols");
});

test("the engine's core alone has no player to build a scene with", () => {
  assert.throws(
    () => Scene.create({ level: level([]), gameData: COMPILED_GAME_DATA }),
    /unknown loadout 'player\.x'/,
  );
});

test("compileLevel resolves enemy kinds against the given game data", () => {
  const byDefault = compileLevel(level([CRAB]));
  assert.equal(byDefault.ok, false);
  assert.equal(byDefault.diagnostics.find((d) => d.code === "enemy.kind")?.entityId, "crab-1");

  const custom = compileLevel(level([CRAB]), crabData());
  assert.equal(custom.ok, true, JSON.stringify(custom.diagnostics));
  if (custom.ok) assert.equal(custom.value.enemies[0].kind, "crab");
});

test("a recorded replay carries the game data hash through encode/decode", () => {
  const gameData = crabData();
  const recorder = new Recorder({ level: level([CRAB]), gameData, seed: 7 });
  for (let i = 0; i < 20; i++) recorder.step(i % 3);

  const replay = recorder.toReplay();
  assert.equal(replay.gameDataHash, gameData.hash);
  const decoded = decodeReplay(encodeReplay(replay));
  assert.equal(decoded.gameDataHash, gameData.hash);
  assert.equal(
    Recorder.replay(decoded, { level: level([CRAB]), gameData }).digest(),
    recorder.scene.digest(),
  );
});

test("a replay recorded against other game data is refused", () => {
  const recorder = new Recorder({ level: level([]), seed: 1, gameData: MMX_COMPILED });
  recorder.step(0);
  const replay = { ...recorder.toReplay(), gameDataHash: "deadbeef" };

  assert.throws(
    () => Recorder.replay(replay, { level: level([]), gameData: MMX_COMPILED }),
    /recorded with game data/,
  );
  assert.throws(() => recorder.load(replay), /recorded with game data/);
  assert.throws(
    () => recorder.load(decodeReplay(encodeReplay(replay))),
    /recorded with game data/,
    "and the hash survives the file format",
  );
});

test("a legacy replay without a game data hash still loads", () => {
  const recorder = new Recorder({ level: level([]), seed: 1, gameData: MMX_COMPILED });
  for (let i = 0; i < 10; i++) recorder.step(2);
  const digest = recorder.scene.digest();
  const { gameDataHash: _, ...legacy } = recorder.toReplay();
  const decoded = decodeReplay(encodeReplay(legacy));

  assert.equal("gameDataHash" in decoded, false);
  assert.equal(
    Recorder.replay(decoded, { level: level([]), gameData: MMX_COMPILED }).digest(),
    digest,
  );
  assert.equal(recorder.load(decoded).digest(), digest);
});
