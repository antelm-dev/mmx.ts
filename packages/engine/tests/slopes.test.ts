import { test } from "node:test";
import assert from "node:assert/strict";

import { Actor } from "../src/game/Actor.js";
import { World } from "../src/game/World.js";
import { DT, TILE_SIZE, WALK_SPEED } from "../src/core/constants.js";

/**
 * Flat floor (row 5) with a ramp rising to the right at column 6 onto a plateau
 * at column 7. The ramp sits directly on the floor, so its foot is flush with
 * the walkable surface.
 */
function upRamp(): World {
  return World.fromRows([
    "################",
    "#..............#",
    "#..............#",
    "#..............#",
    String.raw`#...../#########`,
    "################",
  ]);
}

/** Mirror of {@link upRamp}: a plateau on the left descending to the floor. */
function downRamp(): World {
  return World.fromRows([
    "################",
    "#..............#",
    "#..............#",
    "#..............#",
    String.raw`#####\.........#`,
    "################",
  ]);
}

const FLOOR_TOP = 5 * TILE_SIZE;
const PLATEAU_TOP = 4 * TILE_SIZE;

/**
 * Drop an actor at (x,y) and let it settle onto whatever is below. Gravity is
 * applied by hand because Actor never applies it itself — in the port, as in the
 * original, that is the Movement abilities' job.
 */
function settle(world: World, x: number, y: number): Actor {
  const a = new Actor(world, x, y);
  for (let i = 0; i < 90; i++) step(a);
  return a;
}

/** One gravity-driven physics step, optionally walking at `speed`. */
function step(a: Actor, speed = 0): void {
  a.add_vertical_speed(a.gravity * DT);
  a.set_horizontal_speed(speed);
  a.enable_floor_snap();
  a.physicsStep(DT);
}

test("a body falling onto a ramp rests on its diagonal, not inside it", () => {
  const world = upRamp();
  // Land on the middle of the ramp tile at column 6.
  const a = settle(world, 6 * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE);

  // A box rests on the *highest* ramp point beneath its footprint — here the
  // uphill (right) edge — not on the surface under its centre.
  const uphillEdge = a.pos.x + a.hw;
  const expectedFeet = FLOOR_TOP - (uphillEdge - 6 * TILE_SIZE);
  assert.ok(
    Math.abs(a.pos.y + a.hh - expectedFeet) < 0.01,
    `feet on the ramp surface: ${a.pos.y + a.hh} vs ${expectedFeet}`,
  );
  assert.equal(a.is_on_floor(), true, "a ramp counts as floor");
  assert.equal(world.overlaps(a.pos.x, a.pos.y, a.hw, a.hh), false, "not embedded");
});

test("walking into a ramp climbs it instead of stopping against it", () => {
  const world = upRamp();
  const a = settle(world, 2 * TILE_SIZE, 2 * TILE_SIZE);
  assert.equal(a.pos.y + a.hh, FLOOR_TOP, "starts on the flat floor");

  for (let i = 0; i < 80; i++) {
    step(a, WALK_SPEED);
    assert.equal(
      world.overlaps(a.pos.x, a.pos.y, a.hw, a.hh),
      false,
      `embedded while climbing at x=${a.pos.x}`,
    );
    assert.equal(a.is_on_floor(), true, `left the ground while climbing at x=${a.pos.x}`);
  }

  assert.ok(a.pos.x > 7 * TILE_SIZE, "climbed the ramp and reached the plateau");
  assert.equal(a.pos.y + a.hh, PLATEAU_TOP, "ended flush with the plateau surface");
});

test("walking down a ramp stays glued to the surface", () => {
  const world = downRamp();
  const a = settle(world, 3 * TILE_SIZE + 8, 2 * TILE_SIZE);
  assert.equal(a.pos.y + a.hh, PLATEAU_TOP, "starts on the plateau");

  for (let i = 0; i < 40; i++) {
    step(a, WALK_SPEED);
    assert.equal(a.is_on_floor(), true, `fell off the descending ramp at x=${a.pos.x}`);
    assert.equal(world.overlaps(a.pos.x, a.pos.y, a.hw, a.hh), false, "not embedded");
  }

  assert.ok(a.pos.x > 4 * TILE_SIZE, "walked past the foot of the ramp");
  assert.equal(a.pos.y + a.hh, FLOOR_TOP, "settled onto the flat floor below");
});

test("a ramp does not disturb a body standing well clear of it", () => {
  const world = upRamp();
  const a = settle(world, 2 * TILE_SIZE, 2 * TILE_SIZE);
  assert.equal(a.pos.y + a.hh, FLOOR_TOP, "resting on the flat floor");
  assert.equal(a.is_on_floor(), true);
});

/** Column the shallow ramps below all start climbing from. */
const RAMP_FOOT = 4;

/**
 * A one-tile climb spread over `k` columns, built the way @mmx/ldtk-tools
 * bakes a Slope box: a run of ramp tiles whose profiles chain from one to the
 * next. Row 5 is the floor and the ramp climbs to a plateau at row 4.
 *
 *   1-in-2, cols 4-5:  0->8, 8->16
 *   1-in-4, cols 4-7:  0->4, 4->8, 8->12, 12->16
 *
 * Every ramp shares a foot rather than a crest, so two of them can be compared
 * at the same x partway up.
 */
function shallowRamp(k: number): World {
  const rows = [
    "################",
    "#..............#",
    "#..............#",
    "#..............#",
    "#" + ".".repeat(RAMP_FOOT - 1) + "/".repeat(k) + "#".repeat(16 - RAMP_FOOT - k),
    "################",
  ];
  const slopes: Record<string, [number, number]> = {};
  for (let i = 0; i < k; i++) {
    slopes[`${RAMP_FOOT + i},4`] = [(i * TILE_SIZE) / k, ((i + 1) * TILE_SIZE) / k];
  }
  return World.fromRows(rows, slopes);
}

for (const k of [2, 4]) {
  test(`a 1-in-${k} ramp carries a body up to the plateau without a step`, () => {
    const world = shallowRamp(k);
    const a = settle(world, 2 * TILE_SIZE, 2 * TILE_SIZE);
    assert.equal(a.pos.y + a.hh, FLOOR_TOP, "starts on the flat floor");

    let lastFeet = a.pos.y + a.hh;
    for (let i = 0; i < 90; i++) {
      step(a, WALK_SPEED);
      const feet = a.pos.y + a.hh;
      assert.equal(world.overlaps(a.pos.x, a.pos.y, a.hw, a.hh), false, `embedded at x=${a.pos.x}`);
      assert.equal(a.is_on_floor(), true, `left the ground at x=${a.pos.x}`);
      // The whole point of a shallow ramp: it lifts by a fraction of a tile per
      // step. A jump here would mean the run of tiles is not chaining and the
      // body is climbing one 45-degree face after another.
      assert.ok(
        lastFeet - feet <= TILE_SIZE / 2,
        `rose ${lastFeet - feet}px in one step at x=${a.pos.x}; ramp is not shallow`,
      );
      lastFeet = feet;
    }

    assert.equal(a.pos.y + a.hh, PLATEAU_TOP, "ended flush with the plateau surface");
  });
}

test("a shallower ramp lifts a body less for the same distance walked", () => {
  /** Feet height one tile into the climb — still on the ramp for either k. */
  const feetAfter = (k: number): number => {
    const world = shallowRamp(k);
    const a = settle(world, 2 * TILE_SIZE, 2 * TILE_SIZE);
    for (let i = 0; i < 200 && a.pos.x < (RAMP_FOOT + 1) * TILE_SIZE; i++) step(a, WALK_SPEED);
    return a.pos.y + a.hh;
  };

  // Feet y grows downward, so the shallower ramp leaves them lower.
  assert.ok(feetAfter(4) > feetAfter(2), "the 1-in-4 ramp climbed at least as fast as the 1-in-2");
});

test("a ramp surface stops a fast fall rather than letting it tunnel through", () => {
  const world = upRamp();
  const a = new Actor(world, 6 * TILE_SIZE + TILE_SIZE / 2, TILE_SIZE);
  a.set_vertical_speed(6000); // ~100px in one step, past the ramp and the floor
  a.physicsStep(DT);

  assert.equal(world.overlaps(a.pos.x, a.pos.y, a.hw, a.hh), false, "not inside geometry");
  assert.ok(a.pos.y + a.hh <= FLOOR_TOP, "did not fall through the floor");
});
