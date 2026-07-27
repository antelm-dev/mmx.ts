import { test } from "node:test";
import assert from "node:assert/strict";

import { Camera } from "../src/game/Camera.js";
import { Input } from "../src/core/Input.js";
import { DT, TILE_SIZE } from "../src/core/constants.js";
import { Player } from "../src/game/Player.js";
import { World } from "../src/game/World.js";
import { stage1 as STAGE1 } from "./fixtures/levels.js";

const stage1Entities = (id: string) => STAGE1.entities.filter((entity) => entity.id === id);
const stage1World = () => new World(STAGE1.tiles.slice(), STAGE1.cols, STAGE1.rows, STAGE1.slopes);
const spawnEntity = stage1Entities("Spawn")[0];
const STAGE1_SPAWN = { x: spawnEntity.x, y: spawnEntity.y };
const STAGE1_CAMERA_ZONES = stage1Entities("CameraZone").map((e) => ({
  id: e.iid,
  x: e.x,
  y: e.y,
  w: e.w,
  h: e.h,
  bindX: typeof e.fields.BindX === "boolean" ? e.fields.BindX : true,
  bindY: typeof e.fields.BindY === "boolean" ? e.fields.BindY : true,
}));

test("the grid size the level was authored at matches the engine tile size", () => {
  assert.equal(STAGE1.gridSize, TILE_SIZE);
});

test("spawn comes from the authored Spawn object and sits in open air above a floor", () => {
  assert.deepEqual(
    stage1Entities("Spawn").map((e) => e.id),
    ["Spawn"],
  );

  // The bug the old hand-counted constant documented: no ceiling directly above.
  const world = stage1World();
  const cx = Math.floor(STAGE1_SPAWN.x / TILE_SIZE);
  const cy = Math.floor(STAGE1_SPAWN.y / TILE_SIZE);
  assert.equal(world.isSolidTile(cx, cy), false, "spawn tile is inside geometry");
  assert.equal(world.isSolidTile(cx, cy - 1), false, "no headroom above spawn");
});

test("level camera holds each vertical tier in a stable frame", () => {
  const world = stage1World();
  const camera = new Camera(world.widthPx, world.heightPx);
  camera.setZones(STAGE1_CAMERA_ZONES);
  camera.snapTo(STAGE1_SPAWN.x, STAGE1_SPAWN.y);

  assert.ok(STAGE1_CAMERA_ZONES.length >= 3, "upper, ground, and cavern framing must be authored");
  assert.equal(camera.y, 224, "spawn should use the ground frame");

  // Running and ordinary jumps within a tier should not bob the whole screen.
  for (let i = 0; i < 180; i++) camera.follow(STAGE1_SPAWN.x + 300, 400, DT);
  assert.equal(camera.y, 224, "ground traversal changed the vertical frame");

  // Crossing a tier boundary hands over to the next authored frame and eases
  // there using the regular camera transition rather than cutting immediately.
  camera.follow(STAGE1_SPAWN.x + 300, 480, DT);
  assert.ok(camera.y > 224 && camera.y < 288, "cavern transition did not ease");
  for (let i = 0; i < 180; i++) camera.follow(STAGE1_SPAWN.x + 300, 480, DT);
  assert.equal(camera.y, 288, "cavern did not settle on its frame");

  for (let i = 0; i < 180; i++) camera.follow(STAGE1_SPAWN.x + 300, 200, DT);
  assert.equal(camera.y, 0, "upper route did not settle on its frame");
});

/**
 * Wall-jump upward out of the cavern from `startX`, returning the highest point
 * reached. Holds into the wall and taps jump on a cadence the ability's own input
 * leeway buffers, which is how a player chain-kicks up a single wall.
 */
function climbOutFrom(startX: number, wallX: number): number {
  const input = new Input();
  const world = stage1World();
  const player = new Player(world, startX, 25 * TILE_SIZE, input);

  for (let i = 0; i < 60; i++) player.tick(DT); // drop to the cavern floor

  const toward = wallX > player.pos.x ? "move_right" : "move_left";
  input.setDown(toward, true);
  for (let i = 0; i < 600 && Math.abs(player.pos.x - wallX) > 10; i++) player.tick(DT);

  let best = player.pos.y;
  for (let i = 0; i < 900; i++) {
    input.setDown("jump", i % 20 < 6);
    player.tick(DT);
    best = Math.min(best, player.pos.y);
  }
  return best;
}

/**
 * The cavern's ceiling is six tiles above its floor and a jump clears barely
 * four, so each region down there needs a wall running floor-to-ceiling beside a
 * chute to kick up. An obstacle drawn from the floor instead of hung from the
 * ceiling silently walls a region off and strands anyone who falls in — which is
 * exactly what a mid-cavern pillar did before it was cut short.
 */
const GROUND_SURFACE_Y = 22 * TILE_SIZE;

test("the left cavern region can be escaped by wall-jumping", () => {
  const best = climbOutFrom(30 * TILE_SIZE, 65 * TILE_SIZE - 8);
  assert.ok(best < GROUND_SURFACE_Y, `only reached y ${best}, cavern is a dead end`);
});

test("the right cavern region can be escaped by wall-jumping", () => {
  const best = climbOutFrom(85 * TILE_SIZE, 91 * TILE_SIZE - 8);
  assert.ok(best < GROUND_SURFACE_Y, `only reached y ${best}, cavern is a dead end`);
});

test("each World gets its own tile grid", () => {
  assert.notEqual(stage1World(), stage1World());
  assert.equal(stage1World().tileAt(0, 0), stage1World().tileAt(0, 0));
});
