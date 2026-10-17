import { test } from "node:test";
import assert from "node:assert/strict";

import { buildCompileRegistries } from "../src/behaviors/index.js";
import { Input } from "../src/core/Input.js";
import { REPLAY_ACTIONS } from "../src/core/Replay.js";
import { DT } from "../src/core/constants.js";
import { compileGameData, type CompiledGameData, type GameData } from "../src/data/index.js";
import type { Enemy } from "../src/game/Enemy.js";
import type { LevelData } from "../src/game/LevelData.js";
import { Player } from "../src/game/Player.js";
import { Recorder } from "../src/game/Recorder.js";
import { Stage } from "../src/game/Stage.js";
import { Tile, World } from "../src/game/World.js";
import { spawnEnemy } from "../src/game/enemies/index.js";
import { MMX_COMPILED, MMX_GAME_DATA } from "./support/mmx.js";

/**
 * Death's optional weak phase (MMX1 Spiky): below `weakHealth` the enemy stops,
 * plays its clip and blows itself up after `weakDuration`, unless a hit finishes
 * it first. Without the fields, Death is the plain EnemyDeath port.
 */

const GROUND_ROW = 10;
const FLOOR_Y = GROUND_ROW * 16;

type DeathFields = Record<string, unknown>;

/** The MMX data plus a "spiky": a 2 HP Metool body that only patrols. */
function spikyData(death: DeathFields): ReturnType<typeof compileGameData> {
  const data: GameData = structuredClone(MMX_GAME_DATA);
  data.enemies.spiky = {
    ...data.enemies.metool,
    id: "spiky",
    sheet: "spiky",
    shield: undefined,
    abilities: ["Patrol", "Death"],
    abilityConfig: {
      Patrol: { travelSpeed: 60, travelTime: 0.8, restMin: 0.8, randomTurn: false, conflicts: [] },
      Death: { explosionDuration: 0, ...death },
    },
    reactions: { idle: ["Patrol"] },
  };
  return compileGameData(data, buildCompileRegistries());
}

function compiled(death: DeathFields): CompiledGameData {
  const result = spikyData(death);
  assert.ok(result.ok, JSON.stringify(result.diagnostics));
  return result.value;
}

const WEAK = { weakHealth: 1, weakAnimation: "fall", weakDuration: 1 };

/** A spiky patrolling a walled room, the player parked out of reach. */
function setup(death: DeathFields = WEAK, playerX = 70 * 16) {
  const rows: string[] = [];
  for (let y = 0; y < GROUND_ROW; y++) rows.push("#" + ".".repeat(78) + "#");
  rows.push("#".repeat(80));
  const world = World.fromRows(rows);
  const player = new Player(world, playerX, FLOOR_Y - 14, new Input());
  const stage = new Stage(world, player);
  const gameData = compiled(death);
  const def = gameData.enemies.get("spiky")!;
  const spiky = stage.add(
    spawnEnemy(def, world, 20 * 16, FLOOR_Y - def.actor.body.hh, -1, 1234, gameData),
  );
  return { stage, player, spiky };
}

function run(stage: Stage, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) stage.tick(DT);
}

test("a weak Death stops the enemy, plays its clip, then blows it up", () => {
  const { stage, spiky } = setup();
  let deaths = 0;
  spiky.events.on("death", () => deaths++);
  run(stage, 0.3);
  assert.notEqual(spiky.velocity.x, 0, "it patrols first");

  spiky.damage(1);
  assert.equal(spiky.current_health, 1);
  assert.ok(spiky.is_executing("Death"), "the weak phase runs on Death");
  assert.equal(spiky.is_executing("Patrol"), false, "and interrupts the patrol");
  assert.equal(spiky.ai.active, false, "with the AI switched off");
  assert.equal(spiky.get_animation(), "fall");
  assert.equal(spiky.exploding, false);

  // Lifted off the floor, it still falls back down while standing still.
  spiky.pos.y -= 16;
  const x0 = spiky.pos.x;
  run(stage, 0.9);
  assert.equal(spiky.pos.x, x0, "a weak enemy stays put");
  assert.ok(spiky.is_on_floor(), "but gravity still pulls it");
  assert.equal(spiky.is_executing("Patrol"), false, "and the AI never restarts it");
  assert.ok(spiky.has_health(), "still alive before weakDuration");
  assert.equal(deaths, 0);

  run(stage, 0.15);
  assert.equal(spiky.has_health(), false, "weakDuration zeroes its health");
  assert.equal(deaths, 1, "through the normal blast");
  assert.ok(spiky.alive, "the corpse lingers a second");
  run(stage, 1.1);
  assert.deepEqual(stage.enemies, [], "and is then reaped");
});

test("a hit during the weak phase finishes the enemy at once", () => {
  const { stage, spiky } = setup();
  let deaths = 0;
  spiky.events.on("death", () => deaths++);
  spiky.damage(1);
  run(stage, 0.2);
  assert.ok(spiky.has_health() && spiky.is_executing("Death"), "weak, not yet dead");

  spiky.damage(1);
  assert.equal(spiky.has_health(), false);
  stage.tick(DT);
  assert.equal(deaths, 1, "the blast does not wait for weakDuration");
  run(stage, 1.1);
  assert.deepEqual(stage.enemies, [], "and the corpse goes as usual");
});

test("a weak enemy still hurts on contact", () => {
  const { stage, player, spiky } = setup();
  spiky.damage(1);
  run(stage, 0.1);
  assert.ok(spiky.has_health() && spiky.is_executing("Death"), "weak");
  const health = player.current_health;
  player.pos.x = spiky.pos.x;
  stage.tick(DT);
  assert.ok(player.current_health < health);
});

test("weakHealth 0 leaves Death exactly as it was", () => {
  const trace = (death: DeathFields): string[] => {
    const { stage, spiky } = setup(death);
    const states: string[] = [];
    const step = (frames: number): void => {
      for (let i = 0; i < frames; i++) {
        stage.tick(DT);
        const moves = spiky.executing_moves.map((m) => m.name).join(",");
        states.push(
          `${spiky.pos.x},${spiky.pos.y},${spiky.current_health},${moves},${spiky.alive}`,
        );
      }
    };
    step(20);
    spiky.damage(1);
    step(60);
    spiky.damage(1);
    step(90);
    return states;
  };
  const plain = trace({});
  assert.deepEqual(trace({ weakHealth: 0, weakAnimation: "fall", weakDuration: 1 }), plain);
  assert.ok(plain.at(-1)!.endsWith("false"), "both runs died and were reaped");
});

test("compileGameData validates the weak fields and keeps them optional", () => {
  assert.ok(spikyData({}).ok, "all three may be omitted");
  assert.ok(spikyData(WEAK).ok);
  for (const [field, value] of [
    ["weakHealth", -1],
    ["weakHealth", "1"],
    ["weakAnimation", 3],
    ["weakDuration", -0.5],
    ["weakHp", 1],
  ] as const) {
    const result = spikyData({ [field]: value });
    assert.equal(result.ok, false, `${field}: ${String(value)}`);
    assert.ok(
      result.diagnostics.some((d) => JSON.stringify(d).includes(field)),
      JSON.stringify(result.diagnostics),
    );
  }
});

test("the MMX Starter Death configs carry no weak fields", () => {
  for (const enemy of MMX_COMPILED.enemies.values()) {
    const death = enemy.abilityConfig?.Death as DeathFields | undefined;
    if (death) assert.deepEqual(Object.keys(death), ["explosionDuration"], enemy.id);
  }
});

test("a run through the weak phase replays identically", () => {
  const gameData = compiled({ ...WEAK, weakDuration: 0.5 });
  const COLS = 40;
  const ROWS = 12;
  const tiles = new Array<Tile>(COLS * ROWS).fill(Tile.Empty);
  for (let c = 0; c < COLS; c++) tiles[(ROWS - 1) * COLS + c] = Tile.Solid;
  const level: LevelData = {
    identifier: "spiky-room",
    gridSize: 16,
    cols: COLS,
    rows: ROWS,
    tiles,
    entities: [
      { id: "Spawn", iid: "spawn", x: 32, y: (ROWS - 2) * 16, w: 16, h: 16, fields: {} },
      {
        id: "Enemy",
        iid: "spiky-1",
        x: 12 * 16,
        y: (ROWS - 2) * 16,
        w: 16,
        h: 16,
        fields: { Kind: "spiky" },
      },
    ],
  };
  const fire = 1 << REPLAY_ACTIONS.indexOf("fire");
  const right = 1 << REPLAY_ACTIONS.indexOf("move_right");

  const recorder = new Recorder({ level, gameData, seed: 42 });
  let sawWeak = false;
  let enemy: Enemy | undefined;
  for (let f = 0; f < 360; f++) {
    // Face right, then tap the buster: a lemon a second.
    recorder.step(f < 4 ? right : f % 60 < 3 ? fire : 0);
    enemy ??= recorder.scene.stage.enemies[0];
    if (enemy?.is_executing("Death") && enemy.has_health()) sawWeak = true;
  }
  assert.ok(sawWeak, "the buster put the spiky in its weak phase");
  assert.deepEqual(recorder.scene.stage.enemies, [], "and it died");
  assert.equal(
    Recorder.replay(recorder.toReplay(), { level, gameData }).digest(),
    recorder.scene.digest(),
  );
});
