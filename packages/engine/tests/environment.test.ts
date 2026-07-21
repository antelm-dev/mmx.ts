import { test } from "node:test";
import assert from "node:assert/strict";

import { DT } from "../src/core/constants.js";
import { Input } from "../src/core/Input.js";
import { Player } from "../src/game/Player.js";
import { Stage } from "../src/game/Stage.js";
import { World } from "../src/game/World.js";
import { CONVEYORS, HAZARDS, LEVEL, MOVING_PLATFORM_SPAWNS } from "../src/game/level.js";

test("the mechanics demo is larger than the original and authors every environment type", () => {
  assert.ok(LEVEL.cols > 100);
  assert.ok(LEVEL.rows > 32);
  assert.ok(HAZARDS.length >= 1);
  assert.ok(CONVEYORS.length >= 2);
  assert.ok(CONVEYORS.every((belt) => belt.speed !== 0));
  assert.ok(MOVING_PLATFORM_SPAWNS.length >= 3);
});

test("hazards bypass damage protection and start death immediately", () => {
  const world = World.fromRows(["....", "...."]);
  const player = new Player(world, 16, 16, new Input());
  const stage = new Stage(world, player, {
    hazards: [{ id: "spikes", x: 8, y: 8, w: 16, h: 16 }],
  });

  stage.tick(DT);

  assert.equal(player.current_health, 0);
  assert.equal(player.is_executing("Death"), true);
  assert.equal(player.sprite_visible, false);
});

test("a grounded conveyor adds its signed speed and stops outside the strip", () => {
  const world = World.fromRows([".....", ".....", "#####"]);
  const player = new Player(world, 24, 20, new Input());
  const stage = new Stage(world, player, {
    conveyors: [{ id: "belt", x: 0, y: 24, w: 64, h: 8, speed: 60 }],
  });

  stage.tick(DT); // establish floor contact
  const before = player.pos.x;
  stage.tick(DT);
  assert.ok(player.pos.x > before, "belt did not carry the idle player");
  assert.equal(player.get_conveyor_belt_speed(), 60);

  player.pos.x = 72;
  stage.tick(DT);
  assert.equal(player.get_conveyor_belt_speed(), 0);
});

test("a horizontal platform carries its rider and reverses at its endpoint", () => {
  const world = World.fromRows(["..........", "..........", ".........."]);
  const player = new Player(world, 16, 18, new Input());
  const stage = new Stage(world, player, {
    platforms: [{ id: "lift", x: 0, y: 32, w: 48, h: 8, travel: 16, speed: 60 }],
  });

  const start = player.pos.x;
  for (let i = 0; i < 10; i++) stage.tick(DT);
  assert.ok(player.pos.x > start + 9, `rider only moved to ${player.pos.x}`);
  assert.equal(player.is_on_floor(), true);

  // Several complete round trips with no input: the rider must remain attached
  // rather than requiring the player to walk after the platform every frame.
  const riderOffset = player.pos.x - stage.platforms[0].x;
  for (let i = 0; i < 180; i++) {
    stage.tick(DT);
    assert.equal(player.is_on_floor(), true, `rider detached on frame ${i}`);
    assert.ok(
      Math.abs(player.pos.x - stage.platforms[0].x - riderOffset) < 0.001,
      `platform moved without its rider on frame ${i}`,
    );
  }
});

test("jumping deliberately releases the moving platform", () => {
  const world = World.fromRows(["..........", "..........", ".........."]);
  const input = new Input();
  const player = new Player(world, 16, 18, input);
  const stage = new Stage(world, player, {
    platforms: [{ id: "lift", x: 0, y: 32, w: 48, h: 8, travel: 32, speed: 60 }],
  });

  stage.tick(DT);
  input.setDown("jump", true);
  stage.tick(DT);

  assert.ok(player.get_vertical_speed() < 0);
  assert.equal(player.is_on_floor(), false);
});

test("a falling player lands on a moving platform from above", () => {
  const world = World.fromRows(["..........", "..........", "..........", ".........."]);
  const player = new Player(world, 24, 0, new Input());
  const stage = new Stage(world, player, {
    platforms: [{ id: "bridge", x: 0, y: 48, w: 64, h: 8, travel: 0, speed: 0 }],
  });

  for (let i = 0; i < 60 && !player.is_on_floor(); i++) stage.tick(DT);

  assert.equal(player.is_on_floor(), true);
  assert.equal(player.pos.y + player.hh, 48);
});
