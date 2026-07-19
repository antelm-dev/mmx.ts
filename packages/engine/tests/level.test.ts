import { test } from "node:test";
import assert from "node:assert/strict";

import { Tile, World } from "../src/engine/World.js";
import { LEVEL } from "../src/engine/level.js";
import { level as STAGE1 } from "../src/engine/levels/stage1.js";
import { applySlopes, slopeRects, TILE } from "@mmx/ldtk-tools";
import { Camera } from "../src/engine/Camera.js";
import { Player } from "../src/engine/Player.js";
import { Input } from "../src/core/Input.js";
import { DT, TILE_SIZE } from "../src/core/constants.js";
import { readFileSync } from "node:fs";

/**
 * The authored text grid the LDtk project was built from. Read from the same file
 * the exporter uses rather than copied here, so there is one authority: this pins
 * the import pipeline (levels/stage1.ascii -> LDtk -> @mmx/ldtk-tools import ->
 * src/engine/levels/stage1.ts) to geometry known to exercise every movement state.
 * If a deliberate edit is made in LDtk, update the .ascii alongside it.
 *
 * Parsed here rather than imported from @mmx/ldtk-tools's export CLI: that module
 * writes the .ldtk file and calls process.exit at import time.
 */
const SOURCE = new URL("../../../levels/stage1.ascii", import.meta.url);

function readFixture(url: URL): { legend: string[]; grid: string[] } {
  const text = readFileSync(url, "utf8").replaceAll("\r\n", "\n");
  const blank = text.indexOf("\n\n");
  const body = blank === -1 ? text : text.slice(blank + 2);
  return {
    legend: (blank === -1 ? "" : text.slice(0, blank)).split("\n"),
    grid: body.split("\n").filter((l) => l.length > 0),
  };
}

const { legend: LEGEND, grid: AUTHORED } = readFixture(SOURCE);

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

/** 'S' marks the spawn entity and leaves the tile itself empty. */
const SPAWN_MARK = "S";

const CHAR_TO_NAME: Record<string, string> = {
  "#": "Solid",
  "/": "SlopeUpRight",
  "\\": "SlopeUpLeft",
};

const NAME_TO_TILE: Record<string, Tile> = {
  Empty: Tile.Empty,
  Solid: Tile.Solid,
  SlopeUpRight: Tile.SlopeUpRight,
  SlopeUpLeft: Tile.SlopeUpLeft,
};

/**
 * The Slope boxes the fixture declares in its legend, as `4x2 UpRight at 12,27`.
 *
 * A ramp shallower than 45 degrees has no character that could stand for it in
 * the grid — the whole point of the Slope entity is that steepness is not a
 * property a tile can carry — so the fixture names its boxes in prose instead
 * and this reads them back. Without it the .ascii would stop being the single
 * authority for the level's geometry the moment a ramp stopped being diagonal.
 */
const DECLARED_SLOPES = LEGEND.flatMap((line) => {
  const m = /^\s+(\d+)x(\d+)\s+(\w+)\s+at\s+(\d+),(\d+)$/.exec(line);
  if (!m) return [];
  const [, run, rise, dir, col, row] = m;
  return [
    {
      x: Number(col) * TILE,
      y: Number(row) * TILE,
      w: Number(run) * TILE,
      h: Number(rise) * TILE,
      dir,
    },
  ];
});

/**
 * The authored grid with the fixture's Slope boxes baked over it, through the
 * same code the importer uses.
 */
function authoredWorld(): World {
  const rows = AUTHORED.map((r) => r.replaceAll(SPAWN_MARK, "."));
  const cols = Math.max(...rows.map((r) => r.length));
  const names: string[] = [];
  for (let y = 0; y < rows.length; y++) {
    for (let x = 0; x < cols; x++) names.push(CHAR_TO_NAME[rows[y][x]] ?? "Empty");
  }
  const slopes = applySlopes(names, cols, DECLARED_SLOPES, "levels/stage1.ascii");
  return new World(
    names.map((n) => NAME_TO_TILE[n]),
    cols,
    rows.length,
    slopes,
  );
}

test("the level's Slope boxes are the ones the fixture declares", () => {
  assert.deepEqual(slopeRects(stage1Entities("Slope")), DECLARED_SLOPES);
});

test("the imported level reproduces the authored geometry tile for tile", () => {
  const imported = stage1World();
  const expected = authoredWorld();

  assert.equal(imported.cols, expected.cols);
  assert.equal(imported.rows, expected.rows);

  for (let y = 0; y < expected.rows; y++) {
    for (let x = 0; x < expected.cols; x++) {
      const kind = expected.tileAt(x, y);
      assert.equal(imported.tileAt(x, y), kind, `tile mismatch at ${x},${y}`);
      // Two ramp tiles of the same kind can still be different ramps, so the
      // shape has to be compared too — this is what a mis-baked slope shows up as.
      assert.deepEqual(
        imported.slopeProfile(x, y, kind),
        expected.slopeProfile(x, y, kind),
        `slope profile mismatch at ${x},${y}`,
      );
    }
  }
});

test("the grid size the level was authored at matches the engine tile size", () => {
  assert.equal(LEVEL.gridSize, TILE_SIZE);
});

test("spawn comes from the LDtk Spawn entity and sits in open air above a floor", () => {
  assert.deepEqual(
    stage1Entities("Spawn").map((e) => e.id),
    ["Spawn"],
  );

  // Located from the authored marker, so moving the spawn in the .ascii does not
  // need this expectation restated.
  const markY = AUTHORED.findIndex((r) => r.includes(SPAWN_MARK));
  const markX = AUTHORED[markY].indexOf(SPAWN_MARK);
  assert.deepEqual(STAGE1_SPAWN, { x: markX * TILE_SIZE, y: markY * TILE_SIZE });

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
