import { test } from "node:test";
import assert from "node:assert/strict";

import { Input } from "../src/core/Input.js";
import { DT, ENEMY_STATS, ONE_WAY_DROP_TICKS, TILE_SIZE } from "../src/core/constants.js";
import { Actor } from "../src/game/Actor.js";
import { Player } from "../src/game/Player.js";
import { Stage } from "../src/game/Stage.js";
import { Tile, World } from "../src/game/World.js";
import { makeMetool } from "../src/game/enemies/index.js";
import { LifeCapsule } from "../src/game/Pickup.js";

// Solid floor on row 11 (top 176); a OneWay ledge on row 8 (top 128), columns 3..12.
const FLOOR_Y = 11 * TILE_SIZE;
const LEDGE_Y = 8 * TILE_SIZE;

function room(): World {
  const rows: string[] = [];
  for (let y = 0; y < 11; y++) {
    rows.push(y === 8 ? "#.." + "=".repeat(10) + ".".repeat(16) + "#" : "#" + ".".repeat(28) + "#");
  }
  rows.push("#".repeat(30));
  return World.fromRows(rows);
}

function feet(a: Actor): number {
  return a.pos.y + a.hh;
}

/** Player standing on the floor under the ledge. */
function makePlayer(world = room()) {
  const input = new Input();
  const player = new Player(world, 6 * TILE_SIZE, 10 * TILE_SIZE, input);
  for (let i = 0; i < 5; i++) player.tick(DT);
  return { input, player };
}

/** Jump from the floor through the ledge, land on it; returns per-tick feet trace. */
function jumpOntoLedge(input: Input, player: Player): number[] {
  const trace: number[] = [];
  input.setDown("jump", true);
  for (let i = 0; i < 90; i++) {
    player.tick(DT);
    trace.push(feet(player));
  }
  input.setDown("jump", false);
  for (let i = 0; i < 30; i++) {
    player.tick(DT);
    trace.push(feet(player));
  }
  return trace;
}

function dropThrough(input: Input, player: Player): number[] {
  const trace: number[] = [];
  input.setDown("move_down", true);
  player.tick(DT);
  input.setDown("jump", true);
  for (let i = 0; i < 60; i++) {
    player.tick(DT);
    trace.push(feet(player));
  }
  input.setDown("jump", false);
  input.setDown("move_down", false);
  return trace;
}

test("OneWay is tile 4, written '=' in fixtures, and solid to no other query", () => {
  assert.equal(Tile.OneWay, 4);
  const world = room();
  assert.equal(world.tileAt(3, 8), Tile.OneWay);
  assert.equal(world.isSolidTile(3, 8), false);
  assert.equal(world.overlaps(4 * TILE_SIZE, LEDGE_Y + 8, 4, 4), false);
  assert.equal(world.isFloorAt(4 * TILE_SIZE, LEDGE_Y + 2), true);
});

test("a player jumps up through a OneWay ledge and lands on top of it", () => {
  const { input, player } = makePlayer();
  assert.equal(feet(player), FLOOR_Y);
  const trace = jumpOntoLedge(input, player);
  assert.ok(Math.min(...trace) < LEDGE_Y, "rose above the ledge, through it from below");
  assert.equal(feet(player), LEDGE_Y, "feet flush with the ledge top");
  assert.equal(player.is_on_floor(), true);
  assert.ok(player.is_executing("Idle"), "state=" + player.stateString());
});

test("walking along a OneWay ledge keeps the player on it", () => {
  const { input, player } = makePlayer();
  jumpOntoLedge(input, player);
  input.setDown("move_right", true);
  for (let i = 0; i < 20; i++) {
    player.tick(DT);
    assert.equal(feet(player), LEDGE_Y);
    assert.equal(player.is_on_floor(), true);
  }
});

test("down + jump on a OneWay ledge drops through it instead of jumping", () => {
  const { input, player } = makePlayer();
  jumpOntoLedge(input, player);
  const trace = dropThrough(input, player);
  assert.ok(Math.min(...trace) >= LEDGE_Y, "never rose: no jump happened");
  assert.equal(feet(player), FLOOR_Y, "fell through to the floor below");
  assert.equal(player.is_on_floor(), true);
  assert.ok(ONE_WAY_DROP_TICKS > 0);
});

test("down + jump on a solid floor is still a jump", () => {
  const { input, player } = makePlayer();
  input.setDown("move_down", true);
  input.setDown("jump", true);
  player.tick(DT);
  assert.ok(player.is_executing("Jump"), "state=" + player.stateString());
});

test("a falling body lands on a OneWay only from above; a rising one passes", () => {
  const world = room();
  const falling = new Actor(world, 5 * TILE_SIZE, 4 * TILE_SIZE);
  falling.set_vertical_speed(400);
  for (let i = 0; i < 60; i++) falling.physicsStep(DT);
  assert.equal(feet(falling), LEDGE_Y);
  assert.equal(falling.is_on_floor(), true);

  // Start with the feet already inside the ledge tile: it must not catch them.
  const inside = new Actor(world, 5 * TILE_SIZE, LEDGE_Y + 4 - falling.hh);
  inside.set_vertical_speed(100);
  for (let i = 0; i < 90; i++) inside.physicsStep(DT);
  assert.equal(feet(inside), FLOOR_Y);
});

test("a Metool patrols on a OneWay floor without falling through", () => {
  const rows: string[] = [];
  for (let y = 0; y < 10; y++) rows.push("#" + ".".repeat(38) + "#");
  rows.push("#" + "=".repeat(38) + "#");
  for (let y = 0; y < 3; y++) rows.push("#" + ".".repeat(38) + "#");
  rows.push("#".repeat(40));
  const world = World.fromRows(rows);
  const top = 10 * TILE_SIZE;
  const player = new Player(world, 35 * TILE_SIZE, 14 * TILE_SIZE - 14, new Input());
  const stage = new Stage(world, player);
  const metool = stage.add(
    makeMetool(world, 10 * TILE_SIZE, top - ENEMY_STATS.metool.hh, -1, 1234),
  );
  const xs = new Set<number>();
  for (let i = 0; i < Math.round(6 / DT); i++) {
    stage.tick(DT);
    assert.equal(metool.pos.y + metool.hh, top, `tick ${i}: Metool left the OneWay floor`);
    xs.add(Math.round(metool.pos.x));
  }
  assert.ok(xs.size > 5, "and it actually walked");
  assert.ok(metool.is_on_floor());
});

test("a run with a jump-through and a drop is deterministic", () => {
  const run = (): number[] => {
    const { input, player } = makePlayer();
    return [...jumpOntoLedge(input, player), ...dropThrough(input, player), player.pos.x];
  };
  assert.deepEqual(run(), run());
});

/** Stand on the ledge, then press down + jump (optionally with dash held) and trace the feet. */
function downJumpOnLedge(dash: "held" | "tapped" | "none"): {
  player: Player;
  trace: number[];
  dashJumped: boolean;
} {
  const { input, player } = makePlayer();
  jumpOntoLedge(input, player);
  if (dash === "tapped") {
    input.setDown("dash", true);
    player.tick(DT);
    input.setDown("dash", false);
    player.tick(DT);
  }
  input.setDown("move_down", true);
  if (dash === "held") input.setDown("dash", true);
  player.tick(DT);
  input.setDown("jump", true);
  const trace: number[] = [];
  let dashJumped = false;
  for (let i = 0; i < 60; i++) {
    player.tick(DT);
    trace.push(feet(player));
    dashJumped ||= player.is_executing("DashJump");
  }
  return { player, trace, dashJumped };
}

test("dash held + down + jump on a OneWay ledge is a dash-jump, not a drop", () => {
  const { trace, dashJumped } = downJumpOnLedge("held");
  assert.ok(dashJumped, "DashJump ran");
  assert.ok(Math.min(...trace) < LEDGE_Y - 8, "the body rose off the ledge");
  assert.ok(
    trace.every((y) => y <= LEDGE_Y),
    "and never sank through it",
  );
});

test("a tapped-then-released dash does not stop down + jump from dropping", () => {
  for (const dash of ["tapped", "none"] as const) {
    const { player, trace } = downJumpOnLedge(dash);
    assert.ok(Math.min(...trace) >= LEDGE_Y, `${dash}: no jump happened`);
    assert.equal(feet(player), FLOOR_Y, `${dash}: fell through to the floor`);
  }
});

function capsuleAt(y: number): LifeCapsule {
  return new LifeCapsule({ id: "c", kind: "small", x: 5 * TILE_SIZE, y, w: 8, h: 8 });
}

test("a capsule falling onto a OneWay ledge rests on its top edge", () => {
  const world = room();
  const actor = new Actor(world, 20 * TILE_SIZE, 10 * TILE_SIZE);
  const capsule = capsuleAt(LEDGE_Y - 30 - 8);
  for (let i = 0; i < 120; i++) capsule.tick(DT, actor, world);
  assert.equal(capsule.y + capsule.h, LEDGE_Y);
});

test("a capsule already inside a OneWay ledge falls through to the floor", () => {
  const world = room();
  const actor = new Actor(world, 20 * TILE_SIZE, 10 * TILE_SIZE);
  const capsule = capsuleAt(LEDGE_Y + 2);
  for (let i = 0; i < 120; i++) capsule.tick(DT, actor, world);
  assert.equal(capsule.y + capsule.h, FLOOR_Y);
});
