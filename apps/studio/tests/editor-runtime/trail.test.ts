import { test } from "node:test";
import assert from "node:assert/strict";
import { createLevelDocument, TerrainTile } from "@mmx/content-schema";
import { createPlaytest, PlaytestInput, traceRun } from "../../src/editor-runtime/index.js";
import { projectGameData } from "../../src/renderer/src/core/gameData.js";
import { MMX_OVERLAY } from "../../src/renderer/src/core/mmx.test-support.js";

/** Core + MMX Starter, X and Zero: the game data a project made from the template plays. */
const gameData = projectGameData(MMX_OVERLAY).compiled;

const right = new PlaytestInput();
right.set("move_right", true);

test("a trace re-simulates the run: it ends where Play stopped, and the same run gives the same trail", async () => {
  const session = createPlaytest(createLevelDocument({ cols: 60, rows: 12 }), { gameData });
  await session.start();
  for (let i = 0; i < 240; i++) session.step(i < 90 ? undefined : right);
  const live = session.snapshot().runtime!.player.bounds;
  const run = session.recordedRun()!;
  session.dispose();
  assert.equal(session.recordedRun(), null);

  const trail = (await traceRun(run))!;
  assert.deepEqual(trail.end, { x: live.x + live.w / 2, y: live.y + live.h / 2 });
  assert.equal(trail.segments.length, 1);
  const line = trail.segments[0]!;
  assert.ok(line[line.length - 2]! > line[0]! + 50, "the trail follows the walk to the right");
  // Yielding to the event loop on every slice changes nothing.
  assert.deepEqual(await traceRun(run, { sliceMs: 0 }), trail);
});

test("the trail stops where the player dies", async () => {
  // Floor under the Spawn only: walking right drops the player into the pit, which kills them.
  const doc = createLevelDocument({ cols: 20, rows: 12 });
  const tiles = doc.tiles.map((tile, i) => (i % doc.cols < 6 ? tile : TerrainTile.Empty));
  const session = createPlaytest({ ...doc, tiles }, { gameData });
  await session.start();
  for (let i = 0; i < 400; i++) session.step(i < 60 ? undefined : right);
  assert.equal(session.snapshot().runtime!.player.health, 0);
  const run = session.recordedRun()!;
  session.dispose();

  const trail = (await traceRun(run))!;
  const ys = trail.segments.flat().filter((_, i) => i % 2 === 1);
  assert.equal(trail.segments.length, 1);
  assert.ok(ys.length > 0 && ys.length < 150, "only frames before the death are sampled");
  // The body falls on after the Death state; the end marker stays where the player died.
  assert.ok(trail.end!.y >= Math.max(...ys) && trail.end!.y < 12 * 16 + 64);
});

test("a stale trace resolves null", async () => {
  const session = createPlaytest(createLevelDocument(), { gameData });
  await session.start();
  for (let i = 0; i < 200; i++) session.step();
  const run = session.recordedRun()!;
  session.dispose();
  assert.equal(await traceRun(run, { sliceMs: 0, isStale: () => true }), null);
});
