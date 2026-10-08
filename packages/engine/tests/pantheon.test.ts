import { test } from "node:test";
import assert from "node:assert/strict";

import { Input } from "../src/core/Input.js";
import { DT, ENEMY_STATS } from "../src/core/constants.js";
import type { LevelData, LevelEntity } from "../src/game/LevelData.js";
import { Player } from "../src/game/Player.js";
import { Scene } from "../src/game/Scene.js";
import { Stage } from "../src/game/Stage.js";
import { Tile, World } from "../src/game/World.js";
import { makePantheon } from "../src/game/enemies/index.js";
import type { MeleeSpec } from "../src/game/Character.js";

// Headless: no clip data, so "aim" finishes on the next tick (see enemy.test.ts).

const FLOOR_Y = 10 * 16;

function makeStage(playerX: number) {
  const rows = Array.from({ length: 10 }, () => "#" + ".".repeat(78) + "#");
  rows.push("#".repeat(80));
  const world = World.fromRows(rows);
  const input = new Input();
  const player = new Player(world, playerX, FLOOR_Y - 14, input);
  const stage = new Stage(world, player);
  const pantheon = stage.add(
    makePantheon(world, 30 * 16, FLOOR_Y - ENEMY_STATS.pantheon.hh, -1, 1234),
  );
  return { world, input, player, stage, pantheon };
}

function run(stage: Stage, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) stage.tick(DT);
}

test("an unaware Pantheon patrols and holds its fire", () => {
  const { stage, pantheon } = makeStage(75 * 16);
  const xs = new Set<number>();
  for (let i = 0; i < 240; i++) {
    stage.tick(DT);
    xs.add(Math.round(pantheon.pos.x));
  }
  assert.ok(xs.size > 10, "it walked");
  assert.equal(pantheon.projectiles.length, 0);
  assert.equal(pantheon.is_executing("Shoot"), false);
});

test("a Pantheon shoots a player in range, and the shot hurts", () => {
  const { stage, player, pantheon } = makeStage(30 * 16 + 100);
  const health = player.current_health;
  const dirs: number[] = [];
  for (let i = 0; i < 120; i++) {
    stage.tick(DT);
    for (const shot of pantheon.projectiles) dirs.push(shot.dir);
  }
  assert.ok(dirs.length > 0, "it fired");
  assert.ok(
    dirs.every((d) => d === 1),
    "toward the player",
  );
  assert.equal(player.current_health, health - 2, "bullet_damage 2");
});

test("a Pantheon does not shoot a player out of range", () => {
  const { stage, player, pantheon } = makeStage(30 * 16 + 200);
  for (let i = 0; i < 360; i++) {
    player.pos.x = pantheon.pos.x + 200; // stay outside the 140 px sight as it paces
    stage.tick(DT);
    assert.equal(pantheon.projectiles.length, 0);
  }
});

test("a Pantheon dies to the saber", () => {
  const { stage, player, pantheon } = makeStage(30 * 16 - 24);
  pantheon.get_ability("Shoot")!.active = false;
  const swing: MeleeSpec = { box: { hw: 12, hh: 12, ox: 20 }, damage: 2, activeFrames: 3 };
  player.set_direction(1);
  player.update_facing_direction();
  for (let i = 0; i < 4 && pantheon.has_health(); i++) {
    pantheon.pos.x = player.pos.x + 24;
    player.startMelee(swing);
    stage.tick(DT);
  }
  assert.equal(pantheon.current_health, 0, "hp 4 = two swings of 2");
  run(stage, 1.1);
  assert.equal(stage.enemies.includes(pantheon), false, "reaped after Death");
});

test("a Pantheon dies to four buster shots", () => {
  const { stage, input, player, pantheon } = makeStage(30 * 16 + 60);
  pantheon.get_ability("Shoot")!.active = false;
  player.set_direction(-1);
  player.update_facing_direction();
  for (let shot = 0; shot < 4; shot++) {
    input.setDown("fire", true);
    stage.tick(DT);
    input.setDown("fire", false);
    run(stage, 0.4);
  }
  assert.equal(pantheon.current_health, 0);
  assert.equal(pantheon.is_executing("Death"), true);
});

test("a run with a Pantheon replays to the same digest", () => {
  const GRID = 16;
  const COLS = 40;
  const ROWS = 12;
  const tiles = new Array<Tile>(COLS * ROWS).fill(Tile.Empty);
  for (let c = 0; c < COLS; c++) tiles[(ROWS - 1) * COLS + c] = Tile.Solid;
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
    identifier: "pantheon",
    gridSize: GRID,
    cols: COLS,
    rows: ROWS,
    tiles,
    entities: [entity("Spawn", 10 * GRID, {}), entity("Enemy", 18 * GRID, { Kind: "pantheon" })],
  };
  const FIRE = 1 << 6;
  const RIGHT = 1 << 1;
  const play = () => {
    const scene = Scene.create({ level });
    let shots = 0;
    for (let i = 0; i < 600; i++) {
      scene.step(i > 240 && i % 30 === 0 ? FIRE : i > 400 ? RIGHT : 0);
      shots = Math.max(shots, scene.stage.enemies[0]?.projectiles.length ?? 0);
    }
    return { digest: scene.digest(), shots };
  };
  const a = play();
  assert.ok(a.shots > 0, "the Pantheon fired during the run");
  assert.deepEqual(play(), a);
});
