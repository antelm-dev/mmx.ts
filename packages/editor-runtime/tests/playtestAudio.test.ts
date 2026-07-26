import { test } from "node:test";
import assert from "node:assert/strict";
import { createLevelDocument, newId } from "@mmx/content-schema";
import { createPlaytest, type PlaytestAudio } from "../src/index.js";

function trackingAudio() {
  const calls = { scenes: 0, enemies: 0, stops: 0 };
  const audio: PlaytestAudio = {
    attachScene: () => {
      calls.scenes++;
    },
    attachEnemy: () => {
      calls.enemies++;
    },
    stop: () => {
      calls.stops++;
    },
  };
  return { audio, calls };
}

test("playtest audio attaches the scene on start and stops once on dispose", async () => {
  const { audio, calls } = trackingAudio();
  const session = createPlaytest(createLevelDocument(), { audio });
  await session.start();
  assert.equal(calls.scenes, 1);
  assert.equal(calls.stops, 0);

  session.stop();
  session.dispose();
  session.dispose();
  assert.equal(calls.stops, 1);
});

test("playtest audio re-attaches the scene after restartLevel", async () => {
  const { audio, calls } = trackingAudio();
  const session = createPlaytest(createLevelDocument(), { audio });
  await session.start();
  assert.equal(calls.scenes, 1);

  session.restartLevel();
  assert.equal(calls.scenes, 2);
  session.dispose();
});

test("playtest audio attaches each spawned enemy", async () => {
  const { audio, calls } = trackingAudio();
  const doc = createLevelDocument();
  doc.objects.push(
    { id: newId(), definitionId: "enemy.metool", x: 64, y: 64 },
    { id: newId(), definitionId: "enemy.bat", x: 96, y: 64 },
  );
  const session = createPlaytest(doc, { audio });
  await session.start();
  assert.equal(calls.enemies, 2);
  session.dispose();
});

test("playtest sessions work without audio", async () => {
  const session = createPlaytest(createLevelDocument());
  await session.start();
  session.restartLevel();
  session.stop();
  session.dispose();
  assert.equal(session.snapshot().status, "stopped");
});
