import { test } from "node:test";
import assert from "node:assert/strict";

import { DT, PICKUP_TICK_INTERVAL, LIFE_CAPSULE_STATS } from "../src/core/constants.js";
import { Input } from "../src/core/Input.js";
import { Actor } from "../src/engine/Actor.js";
import { Player } from "../src/engine/Player.js";
import { Stage } from "../src/engine/Stage.js";
import { World } from "../src/engine/World.js";

function room(): World {
  return World.fromRows(["....", "....", "...."]);
}

test("heal() raises current_health, clamped to the maximum, and emits the amount applied", () => {
  const actor = new Actor(room(), 16, 16);
  actor.current_health = actor.max_health - 5;
  let emitted: number[] = [];
  actor.events.on("healed", (n: number) => emitted.push(n));

  actor.heal(3);
  assert.equal(actor.current_health, actor.max_health - 2);
  assert.deepEqual(emitted, [3]);

  emitted = [];
  actor.heal(10); // would overshoot
  assert.equal(actor.current_health, actor.max_health);
  assert.deepEqual(emitted, [2]);

  emitted = [];
  actor.heal(5); // already full
  assert.equal(actor.current_health, actor.max_health);
  assert.deepEqual(emitted, []);
});

test("a small Life Energy capsule heals 2 HP over several ticks, then despawns", () => {
  const world = room();
  const player = new Player(world, 16, 16, new Input());
  player.current_health = player.max_health - 10;
  const stage = new Stage(world, player, {
    pickups: [{ id: "cap", kind: "small", x: 16 - 6, y: 16 - 6, w: 12, h: 12 }],
  });

  assert.equal(LIFE_CAPSULE_STATS.small.heal, 2);

  stage.tick(DT); // overlap detected, consuming begins
  assert.equal(stage.pickups.length, 1);
  assert.equal(stage.pickups[0].collecting, true);
  const healthRightAfterTouch = player.current_health;

  // Healing is metered — one tick's worth of ~0.06s should not apply the full
  // capsule amount instantly.
  stage.tick(DT);
  assert.ok(
    player.current_health < healthRightAfterTouch + LIFE_CAPSULE_STATS.small.heal,
    "capsule applied its full heal in a single frame",
  );

  const ticksNeeded =
    Math.ceil(PICKUP_TICK_INTERVAL / DT) * LIFE_CAPSULE_STATS.small.heal + 5;
  for (let i = 0; i < ticksNeeded; i++) stage.tick(DT);

  assert.equal(player.current_health, player.max_health - 10 + LIFE_CAPSULE_STATS.small.heal);
  assert.equal(stage.pickups.length, 0, "consumed capsule was reaped");
});

test("a large capsule picked up near full health discards the unused overflow", () => {
  const world = room();
  const player = new Player(world, 16, 16, new Input());
  player.current_health = player.max_health - 1;
  const stage = new Stage(world, player, {
    pickups: [{ id: "cap", kind: "large", x: 16 - 6, y: 16 - 6, w: 12, h: 12 }],
  });

  assert.equal(LIFE_CAPSULE_STATS.large.heal, 8);

  for (let i = 0; i < 30; i++) stage.tick(DT);

  assert.equal(player.current_health, player.max_health);
  assert.equal(stage.pickups.length, 0, "capsule was fully consumed despite the overflow");
});

test("the stage freezes while a Life Energy capsule restores health, then resumes", () => {
  const world = room();
  const input = new Input();
  const player = new Player(world, 16, 16, input);
  player.current_health = player.max_health - LIFE_CAPSULE_STATS.large.heal;
  const stage = new Stage(world, player, {
    platforms: [{ id: "platform", x: 48, y: 16, w: 16, h: 8, travel: 32, speed: 60 }],
    pickups: [{ id: "cap", kind: "large", x: 16 - 6, y: 16 - 6, w: 12, h: 12 }],
  });

  stage.tick(DT); // overlap detected; recovery pause begins
  assert.equal(stage.pickups[0].collecting, true);

  const playerX = player.pos.x;
  const playerY = player.pos.y;
  const platformX = stage.platforms[0].x;
  input.setDown("move_right", true);

  stage.tick(DT);
  assert.equal(player.pos.x, playerX, "player moved horizontally during recovery");
  assert.equal(player.pos.y, playerY, "player moved vertically during recovery");
  assert.equal(stage.platforms[0].x, platformX, "platform moved during recovery");

  while (stage.pickups.length > 0) stage.tick(DT);
  stage.tick(DT);

  assert.ok(player.pos.x > playerX, "player did not resume after recovery");
  assert.notEqual(stage.platforms[0].x, platformX, "platform did not resume");
});

test("a Life Energy capsule falls under gravity and settles on the floor", () => {
  const world = World.fromRows([
    "....................",
    "....................",
    "....................",
    "####################",
  ]);
  const player = new Player(world, 300, 16, new Input()); // far from the capsule, on its own floor tile
  const stage = new Stage(world, player, {
    pickups: [{ id: "drop", kind: "small", x: 32, y: 0, w: 16, h: 16 }],
  });

  for (let i = 0; i < 30; i++) stage.tick(DT);

  const capsule = stage.pickups[0];
  assert.equal(capsule.y + capsule.h, 3 * 16, "capsule did not settle on the floor surface");

  const settledY = capsule.y;
  stage.tick(DT);
  assert.equal(capsule.y, settledY, "capsule kept moving after landing");
});

test("a capsule outside the player's reach is left untouched", () => {
  const world = room();
  const player = new Player(world, 16, 16, new Input());
  const stage = new Stage(world, player, {
    pickups: [{ id: "far", kind: "small", x: 200, y: 200, w: 12, h: 12 }],
  });

  for (let i = 0; i < 10; i++) stage.tick(DT);

  assert.equal(stage.pickups.length, 1);
  assert.equal(stage.pickups[0].collecting, false);
});
