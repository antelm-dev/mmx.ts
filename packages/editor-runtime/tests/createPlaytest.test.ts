import { test } from "node:test";
import assert from "node:assert/strict";
import { createLevelDocument } from "@mmx/content-schema";
import { createPlaytest, PlaytestInput, STOPPED_PLAYTEST } from "../src/index.js";

test("createPlaytest advances one fixed step and exposes a public snapshot", async () => {
  const session = createPlaytest(createLevelDocument({ cols: 20, rows: 12 }));
  await session.start();

  const before = session.snapshot();
  assert.equal(before.status, "running");
  assert.equal(before.frame, 0);
  assert.ok(before.runtime);
  assert.equal(before.runtime.player.runtimeId, "player");

  const input = new PlaytestInput();
  input.set("move_right", true);
  session.step(input);

  const after = session.snapshot();
  assert.equal(after.frame, 1);
  assert.ok(after.runtime);
  assert.notEqual(after.runtime.digest, before.runtime!.digest);

  session.dispose();
});

test("dispose is idempotent and rejects further simulation ops", async () => {
  const session = createPlaytest(createLevelDocument());
  await session.start();
  session.dispose();
  session.dispose();

  assert.deepEqual(session.snapshot(), STOPPED_PLAYTEST);
  assert.equal(session.snapshot().frameStats.fps, 0);
  assert.equal(session.snapshot().frameStats.discardedSimulationTime, 0);
  assert.throws(() => session.step(), /disposed/);
  assert.throws(() => session.setCheckpoint(), /disposed/);
  assert.throws(() => session.togglePause(), /disposed/);
});

test("stop returns the stopped snapshot and start can run again", async () => {
  const session = createPlaytest(createLevelDocument());
  await session.start();
  session.step();
  assert.equal(session.snapshot().frame, 1);
  assert.deepEqual(session.snapshot().frameStats, STOPPED_PLAYTEST.frameStats);

  session.stop();
  assert.deepEqual(session.snapshot(), STOPPED_PLAYTEST);

  await session.start();
  assert.equal(session.snapshot().frame, 0);
  session.dispose();
});

test("checkpoints and restarts stay behind the public façade", async () => {
  const session = createPlaytest(createLevelDocument());
  await session.start();

  session.step();
  session.step();
  session.setCheckpoint();
  assert.equal(session.snapshot().checkpointFrame, 2);

  session.step();
  assert.equal(session.snapshot().frame, 3);

  session.restartCheckpoint();
  assert.equal(session.snapshot().frame, 2);

  session.restartLevel();
  assert.equal(session.snapshot().frame, 0);
  assert.equal(session.snapshot().checkpointFrame, 0);

  session.dispose();
});
