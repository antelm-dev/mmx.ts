import { test } from "node:test";
import assert from "node:assert/strict";

import type { LevelData, LevelEntity } from "../src/game/LevelData.js";
import { Recorder } from "../src/game/Recorder.js";
import type { Scene } from "../src/game/Scene.js";
import { Tile } from "../src/game/World.js";

// 60x30 tiles (960x480px), floor on row 12, open space below it down to the world edge.
const COLS = 60;
const ROWS = 30;
const GRID = 16;
const ZONE_BOTTOM = 224;

function pitLevel(withZone: boolean): LevelData {
  const tiles = new Array<Tile>(COLS * ROWS).fill(Tile.Empty);
  for (let c = 0; c < COLS; c++) tiles[12 * COLS + c] = Tile.Solid;
  const entity = (id: string, x: number, y: number, w: number, h: number): LevelEntity => ({
    id,
    iid: `${id}-1`,
    x,
    y,
    w,
    h,
    fields: {},
  });
  const entities = [entity("Spawn", 30 * GRID, 11 * GRID, 16, 16)];
  if (withZone) entities.push(entity("CameraZone", 0, 0, COLS * GRID, ZONE_BOTTOM));
  return { identifier: "pit", gridSize: GRID, cols: COLS, rows: ROWS, tiles, entities };
}

/** Let the intro finish so the player is in ordinary control. */
function settle(scene: Scene): void {
  for (let i = 0; i < 600 && scene.player.is_executing("Intro"); i++) scene.step(0);
  assert.equal(scene.player.is_executing("Intro"), false);
}

/** Drop the player at `y` below the floor and run one step. */
function dropTo(scene: Scene, y: number): void {
  scene.player.pos.y = y;
  scene.step(0);
}

test("falling 32px past the camera zone's bottom kills and restarts at the checkpoint", () => {
  const recorder = new Recorder({ level: pitLevel(true) });
  const scene = recorder.scene;
  settle(scene);
  const spawn = { x: scene.player.pos.x, y: scene.player.pos.y };

  // Below the zone, but still inside the 32px margin: alive.
  dropTo(scene, ZONE_BOTTOM + 16);
  assert.ok(scene.player.has_health());

  dropTo(scene, ZONE_BOTTOM + 33);
  assert.equal(scene.player.current_health, 0);
  assert.equal(scene.player.is_executing("Death"), true);

  // The existing hand-off: Death's "death" event restarts the room from the checkpoint.
  let died = false;
  scene.player.events.on("death", () => (died = true));
  for (let i = 0; i < 600 && !died; i++) scene.step(0);
  assert.ok(died);
  const respawned = recorder.restartLevel();
  settle(respawned);
  assert.ok(respawned.player.has_health());
  assert.deepEqual({ x: respawned.player.pos.x, y: respawned.player.pos.y }, spawn);
});

test("without a camera zone the pit line is the world bottom plus the margin", () => {
  const scene = new Recorder({ level: pitLevel(false) }).scene;
  settle(scene);
  const worldBottom = ROWS * GRID;

  dropTo(scene, ZONE_BOTTOM + 64);
  assert.ok(scene.player.has_health());
  dropTo(scene, worldBottom + 16);
  assert.ok(scene.player.has_health());
  dropTo(scene, worldBottom + 33);
  assert.equal(scene.player.is_executing("Death"), true);
});
