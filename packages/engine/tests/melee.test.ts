import { test } from "node:test";
import assert from "node:assert/strict";

import { Input } from "../src/core/Input.js";
import { DT, ENEMY_STATS } from "../src/core/constants.js";
import { Player } from "../src/game/Player.js";
import { Stage } from "../src/game/Stage.js";
import { World } from "../src/game/World.js";
import { makeBat, makeMetool } from "../src/game/enemies/index.js";
import type { Enemy } from "../src/game/Enemy.js";
import type { MeleeSpec } from "../src/game/Character.js";

const FLOOR_Y = 10 * 16;
const SWING: MeleeSpec = { box: { hw: 12, hh: 12, ox: 24 }, damage: 2, activeFrames: 3 };

function makeStage(facing = 1) {
  const rows = Array.from({ length: 10 }, () => "#" + ".".repeat(78) + "#");
  rows.push("#".repeat(80));
  const world = World.fromRows(rows);
  const player = new Player(world, 40 * 16, FLOOR_Y - 14, new Input());
  player.set_direction(facing);
  player.update_facing_direction();
  return { world, player, stage: new Stage(world, player) };
}

/** A bat with health to spare, pinned at `dx` from the player so it never leaves the box. */
function pinnedBat(world: World, player: Player, dx: number): Enemy {
  const bat = makeBat(world, player.pos.x + dx, player.pos.y, -1, 99);
  bat.max_health = bat.current_health = 10;
  return bat;
}

function tickPinned(stage: Stage, enemy: Enemy, x: number, y: number, ticks: number): void {
  for (let i = 0; i < ticks; i++) {
    enemy.pos.x = x;
    enemy.pos.y = y;
    stage.tick(DT);
  }
}

test("a swing hits an enemy once even if it stays inside for every active frame", () => {
  const { world, player, stage } = makeStage();
  const bat = stage.add(pinnedBat(world, player, 24));
  const { x, y } = bat.pos;

  player.startMelee(SWING);
  tickPinned(stage, bat, x, y, SWING.activeFrames);

  assert.equal(bat.current_health, 10 - SWING.damage);
  assert.equal(player.melee, null, "the box is gone after its active frames");
});

test("a new swing can hit the same enemy again", () => {
  const { world, player, stage } = makeStage();
  const bat = stage.add(pinnedBat(world, player, 24));
  const { x, y } = bat.pos;

  player.startMelee(SWING);
  tickPinned(stage, bat, x, y, 1);
  player.startMelee(SWING);
  tickPinned(stage, bat, x, y, 1);

  assert.equal(bat.current_health, 10 - 2 * SWING.damage);
});

test("inactive frames do not hit", () => {
  const { world, player, stage } = makeStage();
  const bat = stage.add(pinnedBat(world, player, 200));
  player.startMelee(SWING);
  tickPinned(stage, bat, bat.pos.x, bat.pos.y, SWING.activeFrames);

  // The swing has expired; moving the bat into where the box was does nothing.
  tickPinned(stage, bat, player.pos.x + 24, player.pos.y, 5);
  assert.equal(bat.current_health, 10);
});

test("the box mirrors with facing", () => {
  const { world, player, stage } = makeStage(-1);
  const behind = stage.add(pinnedBat(world, player, 24));
  const ahead = stage.add(pinnedBat(world, player, -24));

  player.startMelee(SWING);
  stage.tick(DT);

  assert.equal(behind.current_health, 10, "nothing to the right while facing left");
  assert.equal(ahead.current_health, 10 - SWING.damage);
});

test("a hidden Metool's shield takes the swing without damage", () => {
  const { world, player, stage } = makeStage();
  const metool = stage.add(
    makeMetool(world, player.pos.x + 24, FLOOR_Y - ENEMY_STATS.metool.hh, -1, 1234),
  );
  for (let i = 0; i < 12; i++) stage.tick(DT);
  assert.equal(metool.has_shield(), true, "precondition: hidden");

  const health = metool.current_health;
  player.startMelee({ ...SWING, box: { hw: 40, hh: 40 } });
  for (let i = 0; i < SWING.activeFrames; i++) stage.tick(DT);

  assert.equal(metool.current_health, health);
  assert.equal(metool.has_shield(), true, "the saber does not break the guard");
});
