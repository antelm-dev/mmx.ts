import { test } from "node:test";
import assert from "node:assert/strict";

import { DT } from "../src/core/constants.js";
import { Input } from "../src/core/Input.js";
import { Player } from "../src/game/Player.js";
import { Stage } from "../src/game/Stage.js";
import { World } from "../src/game/World.js";
import { MovingPlatform } from "../src/game/Environment.js";
import { loadLevel } from "../src/game/level.js";
import { stage2 } from "./fixtures/levels.js";
import { MMX_COMPILED } from "./support/mmx.js";

test("the mechanics demo is larger than the original and authors every environment type", () => {
  const level = loadLevel(stage2, MMX_COMPILED);
  assert.ok(level.data.cols > 100);
  assert.ok(level.data.rows > 32);
  assert.ok(level.hazards.length >= 1);
  assert.ok(level.conveyors.length >= 2);
  assert.ok(level.conveyors.every((belt) => belt.speed !== 0));
  assert.ok(level.platforms.length >= 3);
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

test("a vertical platform folds back at both ends like a horizontal one", () => {
  const platform = new MovingPlatform({
    id: "lift",
    x: 0,
    y: 100,
    w: 48,
    h: 8,
    travel: 20,
    speed: 60,
    axis: "vertical",
  });
  let minY = Infinity;
  let maxY = -Infinity;
  const directions = new Set<number>();
  for (let i = 0; i < 120; i++) {
    platform.tick(DT);
    minY = Math.min(minY, platform.y);
    maxY = Math.max(maxY, platform.y);
    directions.add(platform.direction);
    assert.equal(platform.x, 0);
  }
  assert.equal(minY >= 100 && maxY <= 120, true, `left its range: ${minY}..${maxY}`);
  assert.ok(maxY - minY > 19, `span ${maxY - minY}`);
  assert.deepEqual([...directions].sort(), [-1, 1]);
});

for (const speed of [60, 240]) {
  test(`a vertical platform carries its rider up and down at ${speed}px/s`, () => {
    const world = World.fromRows(new Array(12).fill("..........") as string[]);
    const player = new Player(world, 24, 40, new Input());
    const stage = new Stage(world, player, {
      platforms: [{ id: "lift", x: 0, y: 64, w: 64, h: 8, travel: 80, speed, axis: "vertical" }],
    });
    const lift = stage.platforms[0];
    for (let i = 0; i < 60 && !player.is_on_floor(); i++) stage.tick(DT);
    assert.equal(player.is_on_floor(), true, "never landed");

    // A landing can leave the feet a fraction above the top (within the floor
    // probe), as on any platform; the carry must hold that gap exactly — no jitter.
    const gap = lift.y - (player.pos.y + player.hh);
    assert.ok(gap >= 0 && gap < 2, `landed ${gap}px off the top`);
    const directions = new Set<number>();
    for (let i = 0; i < 240; i++) {
      stage.tick(DT);
      directions.add(Math.sign(lift.deltaY));
      assert.equal(player.is_on_floor(), true, `rider detached on frame ${i}`);
      const now = lift.y - (player.pos.y + player.hh);
      assert.ok(Math.abs(now - gap) < 0.001, `rider gap ${now} != ${gap} on frame ${i}`);
      assert.equal(player.pos.x, 24, "a vertical lift pushed its rider sideways");
    }
    assert.ok(directions.has(1) && directions.has(-1), "lift did not go both ways");
  });
}

test("a falling platform waits Delay after it is stood on, falls with its rider, then despawns", () => {
  // 6 rows = 96px of world: the platform leaves it after a short fall.
  const world = World.fromRows(new Array(6).fill("..........") as string[]);
  const player = new Player(world, 24, 0, new Input());
  const stage = new Stage(world, player, {
    fallingPlatforms: [{ id: "drop", x: 0, y: 32, w: 64, h: 8, delay: 0.25 }],
  });
  const platform = stage.fallingPlatforms[0];

  let frames = 0;
  while (!player.is_on_floor()) {
    stage.tick(DT);
    assert.ok(++frames < 60, "never landed");
  }
  // Untouched until landed on, then still for the delay.
  for (let i = 0; i < 14; i++) {
    stage.tick(DT);
    assert.equal(platform.y, 32, `fell early on frame ${i}`);
  }
  let fell = false;
  for (let i = 0; i < 3; i++) {
    stage.tick(DT);
    fell ||= platform.y > 32;
  }
  assert.ok(fell, "did not fall after its delay");

  // The rider goes down with it, standing on it, until it leaves the world.
  const gap = platform.y - (player.pos.y + player.hh);
  while (stage.fallingPlatforms.length > 0) {
    assert.equal(player.is_on_floor(), true);
    const now = platform.y - (player.pos.y + player.hh);
    assert.ok(Math.abs(now - gap) < 0.001, `rider gap ${now} != ${gap}`);
    stage.tick(DT);
    assert.ok(++frames < 300, "never despawned");
  }
  assert.ok(platform.y > world.heightPx);
  stage.tick(DT);
  assert.equal(player.is_on_floor(), false, "rider still standing on a despawned platform");
});

test("a falling platform nobody stands on never falls", () => {
  const world = World.fromRows(new Array(6).fill("..........") as string[]);
  const player = new Player(world, 120, 0, new Input());
  const stage = new Stage(world, player, {
    fallingPlatforms: [{ id: "drop", x: 0, y: 32, w: 64, h: 8, delay: 0 }],
  });
  for (let i = 0; i < 120; i++) stage.tick(DT);
  assert.equal(stage.fallingPlatforms[0].y, 32);
});
