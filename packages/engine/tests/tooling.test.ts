import { test } from "node:test";
import assert from "node:assert/strict";

import { Tile, World } from "../src/game/World.js";
import type { LevelData, LevelEntity } from "../src/game/LevelData.js";
import { ToolingSession } from "../src/tooling/ToolingSession.js";
import { VIEW_WIDTH, VIEW_HEIGHT } from "../src/core/constants.js";
import { Player } from "../src/game/Player.js";
import { Input } from "../src/core/Input.js";

const COLS = 16;
const ROWS = 8;
const GRID = 16;

function entity(over: Partial<LevelEntity> & { id: string; iid: string }): LevelEntity {
  return { x: 32, y: 32, w: 16, h: 16, fields: {}, ...over };
}

/** A small runnable level: floor, spawn, and two enemies for ordering checks. */
function testLevel(): LevelData {
  const tiles = new Array<Tile>(COLS * ROWS).fill(Tile.Empty);
  for (let c = 0; c < COLS; c++) tiles[(ROWS - 1) * COLS + c] = Tile.Solid;
  return {
    identifier: "tooling-fixture",
    gridSize: GRID,
    cols: COLS,
    rows: ROWS,
    tiles,
    entities: [
      entity({ id: "Spawn", iid: "spawn-1", x: 48, y: (ROWS - 2) * GRID }),
      entity({ id: "Enemy", iid: "enemy-a", x: 96, y: (ROWS - 2) * GRID, fields: { Kind: "metool" } }),
      entity({ id: "Enemy", iid: "enemy-b", x: 160, y: (ROWS - 2) * GRID, fields: { Kind: "metool" } }),
    ],
  };
}

const RIGHT = 1 << 1; // move_right, per REPLAY_ACTIONS order

test("step advances exactly one deterministic fixed step", () => {
  const session = new ToolingSession({ level: testLevel() });
  assert.equal(session.frame, 0);
  const snap = session.step(0);
  assert.equal(session.frame, 1);
  assert.equal(snap.frame, 1);
});

test("inspect is side-effect free", () => {
  const session = new ToolingSession({ level: testLevel() });
  for (let i = 0; i < 20; i++) session.step(RIGHT);
  const a = session.inspect();
  const b = session.inspect();
  assert.equal(session.frame, 20);
  assert.deepEqual(a, b);
  // Stepping after two inspections must reach the same digest a single run would.
  const control = new ToolingSession({ level: testLevel() });
  for (let i = 0; i < 20; i++) control.step(RIGHT);
  assert.equal(a.digest, control.inspect().digest);
});

test("snapshot ordering is stable and identity-carrying", () => {
  const session = new ToolingSession({ level: testLevel() });
  const snap = session.inspect();
  assert.equal(snap.player.runtimeId, "player");
  assert.deepEqual(
    snap.actors.map((a) => a.runtimeId),
    ["enemy-a", "enemy-b"],
  );
  assert.equal(snap.actors[0].sourceEntityId, "enemy-a");
  assert.equal(snap.camera.viewport.width, VIEW_WIDTH);
  assert.equal(snap.camera.viewport.height, VIEW_HEIGHT);
});

test("restarting a checkpoint reaches the same digest deterministically", () => {
  const session = new ToolingSession({ level: testLevel() });
  for (let i = 0; i < 30; i++) session.step(RIGHT);
  session.setCheckpoint();
  const atCheckpoint = session.inspect().digest;
  for (let i = 0; i < 40; i++) session.step(RIGHT);

  const restored = session.restartCheckpoint();
  assert.equal(restored.frame, 30);
  assert.equal(restored.digest, atCheckpoint);
});

test("seek clamps and lands on the recorded state at that frame", () => {
  const session = new ToolingSession({ level: testLevel() });
  const digests: string[] = [];
  for (let i = 0; i < 40; i++) {
    session.step(RIGHT);
    digests.push(session.inspect().digest);
  }
  // digests[i] is the state at frame i+1.
  const seeked = session.seek(10);
  assert.equal(seeked.frame, 10);
  assert.equal(seeked.digest, digests[9]);

  // Clamp beyond the recording rather than throwing.
  const clamped = session.seek(9999);
  assert.equal(clamped.frame, 40);
});

test("sceneRevision bumps only when the scene instance is replaced", () => {
  const session = new ToolingSession({ level: testLevel() });
  assert.equal(session.sceneRevision, 0);
  for (let i = 0; i < 5; i++) session.step(0);
  assert.equal(session.sceneRevision, 0, "stepping must not replace the scene");

  const before = session.scene;
  session.restartLevel();
  assert.notEqual(session.scene, before);
  assert.equal(session.sceneRevision, 1);

  session.seek(0);
  assert.equal(session.sceneRevision, 2);
});

test("restartLevel discards the recording and returns to frame zero", () => {
  const session = new ToolingSession({ level: testLevel() });
  for (let i = 0; i < 15; i++) session.step(RIGHT);
  session.setCheckpoint();
  const snap = session.restartLevel();
  assert.equal(snap.frame, 0);
  assert.equal(session.checkpointFrame, 0);
});

test("projectiles get deterministic, counter-derived runtime ids", () => {
  const build = (): Player => {
    const world = new World(new Array<Tile>(COLS * ROWS).fill(Tile.Empty), COLS, ROWS);
    return new Player(world, 48, 48, new Input());
  };
  const a = build();
  a.spawnBuster(0);
  assert.equal(a.projectiles[0].runtimeId, "projectile:0");

  // A second player fed the same call produces the same id — no randomness.
  const b = build();
  b.spawnBuster(0);
  assert.equal(b.projectiles[0].runtimeId, "projectile:0");
});
