import { test } from "node:test";
import assert from "node:assert/strict";

import { Input } from "../src/core/Input.js";
import { DT } from "../src/core/constants.js";
import { REPLAY_ACTIONS } from "../src/core/Replay.js";
import type { LevelData, LevelEntity } from "../src/game/LevelData.js";
import { Player } from "../src/game/Player.js";
import { Recorder } from "../src/game/Recorder.js";
import { Stage } from "../src/game/Stage.js";
import { Tile, World } from "../src/game/World.js";
import { spawnEnemy } from "../src/game/enemies/index.js";
import type { Enemy } from "../src/game/Enemy.js";
import { GAME_DATA, compileGameData, type GameData } from "../src/data/index.js";
import { buildCompileRegistries } from "../src/behaviors/index.js";
import type { RollConfig } from "../src/game/enemy/Roll.js";

// Headless: no clip data (see enemy.test.ts). A Spiky-like test enemy built on
// the Metool's body, with Roll answering idle and nothing else.

const FLOOR_Y = 10 * 16;
const SPEED = 60;

function spikyData(roll: Partial<RollConfig> = {}): GameData {
  const data: GameData = structuredClone(GAME_DATA);
  data.enemies.spiky = {
    ...data.enemies.metool!,
    id: "spiky",
    sheet: "spiky",
    shield: undefined,
    abilities: ["Roll", "Death"],
    abilityConfig: {
      Roll: { speed: SPEED, facePlayer: true, atWall: "turn", conflicts: [], ...roll },
      Death: { explosionDuration: 0 },
    },
    reactions: { idle: ["Roll"] },
  };
  return data;
}

function compiled(data: GameData) {
  const result = compileGameData(data, buildCompileRegistries());
  assert.ok(result.ok, JSON.stringify(result.diagnostics));
  return result.value;
}

/** A walled room (or `rows`), the player parked at `playerX`, one spiky standing at `spawnY`. */
function setup(opts: {
  x: number;
  facing: number;
  playerX: number;
  roll?: Partial<RollConfig>;
  rows?: string[];
  spawnY?: number;
}): { stage: Stage; spiky: Enemy } {
  const rows = opts.rows ?? [
    ...Array.from({ length: 10 }, () => "#" + ".".repeat(78) + "#"),
    "#".repeat(80),
  ];
  const world = World.fromRows(rows);
  const player = new Player(world, opts.playerX, FLOOR_Y - 14, new Input());
  const stage = new Stage(world, player);
  const data = compiled(spikyData(opts.roll));
  const def = data.enemies.get("spiky")!;
  const y = (opts.spawnY ?? FLOOR_Y) - def.actor.body.hh;
  const spiky = stage.add(spawnEnemy(def, world, opts.x, y, opts.facing, 1234, data));
  return { stage, spiky };
}

function run(stage: Stage, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) stage.tick(DT);
}

test("a roller turns to face the player, then rolls at full speed without a pause", () => {
  // Spawned facing away (-1), with the player 150px to its right, inside vision.
  const { stage, spiky } = setup({ x: 20 * 16, facing: -1, playerX: 20 * 16 + 150 });
  stage.tick(DT);
  assert.equal(spiky.get_facing_direction(), 1, "it faces the player on the first frame");
  assert.ok(spiky.is_executing("Roll"));

  let x = spiky.pos.x;
  for (let i = 0; i < 60; i++) {
    stage.tick(DT);
    assert.equal(spiky.velocity.x, SPEED, `full speed on tick ${i}`);
    assert.ok(Math.abs(spiky.pos.x - x - SPEED * DT) < 1e-6, `moved ${spiky.pos.x - x}px`);
    x = spiky.pos.x;
  }
  assert.ok(spiky.is_executing("Roll"), "the roll never ends on its own");
});

test("without facePlayer, a roller keeps its spawn direction", () => {
  const { stage, spiky } = setup({
    x: 20 * 16,
    facing: -1,
    playerX: 20 * 16 + 150,
    roll: { facePlayer: false },
  });
  const x0 = spiky.pos.x;
  run(stage, 0.5);
  assert.equal(spiky.get_facing_direction(), -1);
  assert.ok(spiky.pos.x < x0 - 25, "rolled away from the player");
});

test("a roller turns around at a wall and keeps rolling", () => {
  // The right wall is column 79; the player sits far left, out of vision.
  const { stage, spiky } = setup({ x: 74 * 16, facing: 1, playerX: 4 * 16 });
  const facings: number[] = [];
  let maxX = -Infinity;
  for (let i = 0; i < Math.round(3 / DT); i++) {
    stage.tick(DT);
    facings.push(spiky.get_facing_direction());
    maxX = Math.max(maxX, spiky.pos.x);
    if (i > 0) assert.equal(Math.abs(spiky.velocity.x), SPEED, `still rolling on tick ${i}`);
  }
  assert.equal(facings[0], 1);
  assert.equal(facings.at(-1), -1, "it turned back at the wall");
  assert.ok(maxX + spiky.hw <= 79 * 16, "and never sank into it");
  assert.ok(spiky.pos.x < maxX - 60, "and rolled back the other way");
});

test("with atWall 'stop', a roller halts against the wall and stays rolling", () => {
  const { stage, spiky } = setup({
    x: 74 * 16,
    facing: 1,
    playerX: 4 * 16,
    roll: { atWall: "stop" },
  });
  run(stage, 3);
  const x = spiky.pos.x;
  assert.equal(spiky.velocity.x, 0);
  assert.equal(spiky.get_facing_direction(), 1, "no turn");
  assert.ok(spiky.is_executing("Roll"), "the ability stays active");
  run(stage, 1);
  assert.equal(spiky.pos.x, x, "it holds still");
  assert.ok(x + spiky.hw <= 79 * 16);
});

test("a roller drops off a ledge and keeps rolling on the floor below", () => {
  // A 4-tile-high shelf over columns 1-30; the floor below is row 10.
  const rows = Array.from({ length: 10 }, (_, y) =>
    y === 6 ? "#".repeat(31) + ".".repeat(48) + "#" : "#" + ".".repeat(78) + "#",
  );
  rows.push("#".repeat(80));
  const { stage, spiky } = setup({
    x: 25 * 16,
    facing: 1,
    playerX: 70 * 16,
    spawnY: 6 * 16,
    roll: { facePlayer: false },
    rows,
  });
  const y0 = spiky.pos.y;
  run(stage, 0.5);
  assert.equal(spiky.pos.y, y0, "rolls along the shelf first");
  run(stage, 2);
  assert.equal(spiky.pos.y, FLOOR_Y - spiky.hh, "landed on the floor below");
  assert.ok(spiky.pos.x > 31 * 16, "past the edge");
  assert.equal(spiky.velocity.x, SPEED, "still rolling");
});

test("a run with a roller replays to the same digest", () => {
  const GRID = 16;
  const COLS = 40;
  const ROWS = 12;
  const tiles = new Array<Tile>(COLS * ROWS).fill(Tile.Empty);
  for (let c = 0; c < COLS; c++) tiles[(ROWS - 1) * COLS + c] = Tile.Solid;
  for (let r = 0; r < ROWS; r++) tiles[r * COLS + COLS - 1] = Tile.Solid;
  const entity = (id: string, x: number, fields: LevelEntity["fields"]): LevelEntity => ({
    id,
    iid: `${id}-1`,
    x,
    y: (ROWS - 2) * GRID,
    w: 16,
    h: 16,
    fields,
  });
  const level: LevelData = {
    identifier: "roll",
    gridSize: GRID,
    cols: COLS,
    rows: ROWS,
    tiles,
    entities: [entity("Spawn", 4 * GRID, {}), entity("Enemy", 14 * GRID, { Kind: "spiky" })],
  };
  const gameData = compiled(spikyData());
  const RIGHT = 1 << REPLAY_ACTIONS.indexOf("move_right");
  const FIRE = 1 << REPLAY_ACTIONS.indexOf("fire");

  const recorder = new Recorder({ level, seed: 0xc0ffee, gameData });
  const xs = new Set<number>();
  for (let i = 0; i < 300; i++) {
    recorder.step(i % 40 === 0 ? FIRE : i > 200 ? RIGHT : 0);
    const spiky = recorder.scene.stage.enemies[0];
    if (spiky) xs.add(Math.round(spiky.pos.x));
  }
  assert.ok(xs.size > 20, "the roller moved during the run");

  const live = recorder.scene.digest();
  const replayed = Recorder.replay(recorder.toReplay(), { level, gameData }).digest();
  assert.equal(replayed, live, "replaying a recording must reproduce the run it captured");
});

test("compileGameData accepts a Roll config and rejects an invalid one", () => {
  compiled(spikyData({ atWall: "stop", speed: 0 }));

  const reject = (roll: Record<string, unknown>, field: string): void => {
    const data = spikyData();
    data.enemies.spiky!.abilityConfig!.Roll = roll as never;
    const result = compileGameData(data, buildCompileRegistries());
    assert.equal(result.ok, false, JSON.stringify(roll));
    assert.match(JSON.stringify(result.diagnostics), new RegExp(field));
  };
  const valid = { speed: SPEED, facePlayer: true, atWall: "turn", conflicts: [] };
  reject({ ...valid, atWall: "explode" }, "must be one of 'turn', 'stop'");
  reject({ ...valid, speed: -1 }, "must be >= 0");
  reject({ ...valid, facePlayer: "yes" }, "must be a boolean");
  const { conflicts: _, ...noConflicts } = valid;
  reject(noConflicts, "missing config 'conflicts'");
  reject({ ...valid, travelTime: 1 }, "unknown config key 'travelTime'");
});
