import { test } from "node:test";
import assert from "node:assert/strict";

import { Actor } from "../src/game/Actor.js";
import { Projectile } from "../src/game/Projectile.js";
import { World } from "../src/game/World.js";
import { BODY_HALF_H, BODY_HALF_W, DT, TILE_SIZE } from "../src/core/constants.js";

/** A room with solid borders and whatever interior rows are given. */
function room(interior: string[]): World {
  const width = interior[0].length + 2;
  const rows = ["#".repeat(width), ...interior.map((r) => "#" + r + "#"), "#".repeat(width)];
  return World.fromRows(rows);
}

/** Open room, 10 tiles wide and 6 tall inside the border. */
function openRoom(): World {
  return room(Array.from({ length: 6 }, () => ".".repeat(10)));
}

test("a falling body comes to rest exactly on the tile face, not near it", () => {
  const world = openRoom();
  const a = new Actor(world, 5 * TILE_SIZE, 2 * TILE_SIZE);
  a.set_vertical_speed(200);
  for (let i = 0; i < 60; i++) a.physicsStep(DT);

  const floorTop = 7 * TILE_SIZE; // bottom border row starts at row 7
  assert.equal(a.pos.y + a.hh, floorTop, "feet flush with the floor face");
  assert.equal(a.is_on_floor(), true);
  assert.equal(world.overlaps(a.pos.x, a.pos.y, a.hw, a.hh), false, "not embedded");
});

test("a single huge step cannot tunnel through a wall", () => {
  const world = openRoom();
  const a = new Actor(world, 3 * TILE_SIZE, 3 * TILE_SIZE);
  // 60000 px/s is ~1000px in one 60Hz step — far past the right border wall.
  a.set_horizontal_speed(60000);
  a.physicsStep(DT);

  const wallFace = 11 * TILE_SIZE; // right border column
  assert.equal(a.pos.x + a.hw, wallFace, "stopped flush against the wall");
  assert.equal(a.is_colliding_with_wall(), 1);
  assert.equal(a.velocity.x, 0, "horizontal speed cancelled by the hit");
});

test("tunnelling is blocked in every direction", () => {
  const world = openRoom();
  const bounds = {
    left: TILE_SIZE,
    right: 11 * TILE_SIZE,
    top: TILE_SIZE,
    bottom: 7 * TILE_SIZE,
  };
  for (const [vx, vy] of [
    [-60000, 0],
    [60000, 0],
    [0, -60000],
    [0, 60000],
  ]) {
    const a = new Actor(world, 5 * TILE_SIZE + 8, 4 * TILE_SIZE);
    a.set_horizontal_speed(vx);
    a.set_vertical_speed(vy);
    a.physicsStep(DT);

    const where = `v=(${vx},${vy}) -> (${a.pos.x},${a.pos.y})`;
    assert.equal(world.overlaps(a.pos.x, a.pos.y, a.hw, a.hh), false, `embedded: ${where}`);
    assert.ok(a.pos.x - a.hw >= bounds.left, `left through the wall: ${where}`);
    assert.ok(a.pos.x + a.hw <= bounds.right, `right through the wall: ${where}`);
    assert.ok(a.pos.y - a.hh >= bounds.top, `up through the ceiling: ${where}`);
    assert.ok(a.pos.y + a.hh <= bounds.bottom, `down through the floor: ${where}`);
  }
});

test("a body resting against a wall stays put and keeps reporting the wall", () => {
  const world = openRoom();
  const a = new Actor(world, 3 * TILE_SIZE, 3 * TILE_SIZE);
  // travel until it reaches the wall
  for (let i = 0; i < 10; i++) {
    a.set_horizontal_speed(6000);
    a.physicsStep(DT);
  }
  const restX = a.pos.x;
  assert.equal(restX + a.hw, 11 * TILE_SIZE, "reached the wall face");

  // keep pushing into it for a while — it must not creep, jitter or embed
  for (let i = 0; i < 30; i++) {
    a.set_horizontal_speed(6000);
    a.physicsStep(DT);
    assert.equal(a.pos.x, restX, "no drift while pressed against the wall");
    assert.equal(a.is_colliding_with_wall(), 1);
  }
});

test("floor snap does not glue a body to a drop deeper than the snap length", () => {
  // A raised block ending mid-room; walking off it is a full 16px drop, more
  // than FLOOR_SNAP_LENGTH, so the body must leave the floor and fall.
  const world = room([
    "..........",
    "..........",
    "..........",
    "..........",
    "#####.....",
    "..........",
  ]);
  const a = new Actor(world, 2 * TILE_SIZE, 0);
  a.pos.y = 5 * TILE_SIZE - BODY_HALF_H;
  a.physicsStep(DT);
  assert.equal(a.is_on_floor(), true, "starts grounded on the block");

  // the block ends at x = 6 tiles; walk well past its edge
  for (let i = 0; i < 60; i++) {
    a.set_horizontal_speed(90);
    a.physicsStep(DT);
  }
  assert.ok(a.pos.x - a.hw > 6 * TILE_SIZE, "walked clear of the block");
  assert.equal(a.is_on_floor(), false, "a drop taller than the snap length falls");
});

test("floor snap bridges a dip shallower than FLOOR_SNAP_LENGTH", () => {
  const world = openRoom();
  const a = new Actor(world, 3 * TILE_SIZE, 0);
  a.pos.y = 7 * TILE_SIZE - BODY_HALF_H;
  a.physicsStep(DT);
  assert.equal(a.is_on_floor(), true);

  // lift the body 4px (inside the 8px snap length) as if cresting a bump, then
  // let it walk — snap must pull it straight back to the floor, no Fall frame.
  a.pos.y -= 4;
  a.set_horizontal_speed(90);
  a.enable_floor_snap();
  a.physicsStep(DT);

  assert.equal(a.pos.y + a.hh, 7 * TILE_SIZE, "snapped flush back onto the floor");
  assert.equal(a.is_on_floor(), true, "never left the floor");
});

test("a shot stops at the wall face rather than inside it", () => {
  const world = openRoom();
  const wallFace = 11 * TILE_SIZE;
  const p = new Projectile(wallFace, 3 * TILE_SIZE, 1, 3); // fast charged shot
  // Place it explicitly: the constructor applies the charged shot's muzzle pullback,
  // which is spawn-positioning noise for a test that is only about the sweep.
  p.x = wallFace - 4;
  assert.ok(Math.abs(p.vx) * DT > 4, "this step overshoots the wall");

  p.update(DT, world);
  assert.equal(p.x, wallFace, "impact registered on the surface");
  // A shot that connects is spent, not gone: it stops moving and stops colliding,
  // but stays in the list long enough for its hit particle to play out.
  assert.equal(p.phase, "spent");
  assert.equal(p.isLive, false, "no longer collides");
  assert.equal(p.alive, true, "still around for the impact effect");

  // ...and it does eventually clear itself out.
  for (let i = 0; i < 60; i++) p.update(DT, world);
  assert.equal(p.alive, false, "removed once the effect finishes");
  assert.equal(p.x, wallFace, "never drifted past the impact point");
});

test("sweep results always agree with the overlap test", () => {
  const world = room([
    "..........",
    "...##.....",
    "..........",
    ".....#....",
    "..........",
    "..........",
  ]);
  // Sweep from a grid of start points in both axes and assert the resolved
  // position is never inside a solid tile.
  for (let x = TILE_SIZE + BODY_HALF_W; x < 10 * TILE_SIZE; x += 3) {
    for (let y = TILE_SIZE + BODY_HALF_H; y < 6 * TILE_SIZE; y += 3) {
      if (world.overlaps(x, y, BODY_HALF_W, BODY_HALF_H)) continue;
      for (const d of [-40, -7, 7, 40]) {
        const sx = world.sweepX(x, y, BODY_HALF_W, BODY_HALF_H, d);
        assert.equal(
          world.overlaps(sx.pos, y, BODY_HALF_W, BODY_HALF_H),
          false,
          `sweepX from ${x},${y} by ${d} landed inside a tile at ${sx.pos}`,
        );
        const sy = world.sweepY(x, y, BODY_HALF_W, BODY_HALF_H, d);
        assert.equal(
          world.overlaps(x, sy.pos, BODY_HALF_W, BODY_HALF_H),
          false,
          `sweepY from ${x},${y} by ${d} landed inside a tile at ${sy.pos}`,
        );
      }
    }
  }
});

test("a body the floor sweep still supports reports is_on_floor, right to the ledge corner", () => {
  // Ledge occupying the left half of the interior; its right face is at x=6*TILE.
  const world = room([
    "..........",
    "..........",
    "..........",
    "#####.....",
    "..........",
    "..........",
  ]);
  const ledgeTop = 4 * TILE_SIZE;

  // Walk the body across the lip in sub-pixel steps. Anywhere the downward sweep
  // still catches the ledge, the floor sensor has to agree — otherwise the body
  // hangs in Fall with gravity cancelled every frame and nothing can start.
  for (let x = 5 * TILE_SIZE; x < 7 * TILE_SIZE; x += 0.2) {
    const a = new Actor(world, x, ledgeTop - BODY_HALF_H);
    a.set_vertical_speed(60);
    a.physicsStep(DT);
    const supported = a.pos.y + a.hh === ledgeTop && a.get_vertical_speed() === 0;
    if (supported) {
      assert.equal(a.is_on_floor(), true, `held up by the ledge at x=${x} but not on floor`);
    }
  }
});
