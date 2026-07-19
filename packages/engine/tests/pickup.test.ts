import { test } from "node:test";
import assert from "node:assert/strict";

import { DT, LIFE_CAPSULE_HEAL_TICK_INTERVAL, LIFE_CAPSULE_STATS } from "../src/core/constants.js";
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
    Math.ceil(LIFE_CAPSULE_HEAL_TICK_INTERVAL / DT) * LIFE_CAPSULE_STATS.small.heal + 5;
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
