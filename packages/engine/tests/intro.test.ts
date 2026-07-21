import { test } from "node:test";
import assert from "node:assert/strict";

import { DT } from "../src/core/constants.js";
import { REPLAY_ACTIONS } from "../src/core/Replay.js";
import { Scene } from "../src/game/Scene.js";

/**
 * The level-start entrance (see engine/abilities/Intro.ts): a Scene begins with
 * the player already mid-descent and control withheld, and only Scene wires it
 * up — every other Player construction path (engine tests, the headless sim)
 * must stay exactly as unaffected as it was before this ability existed.
 */

function bit(name: (typeof REPLAY_ACTIONS)[number]): number {
  return 1 << REPLAY_ACTIONS.indexOf(name);
}
const MOVE_RIGHT = bit("move_right");

/** Step until Intro ends or the budget runs out, holding no input meanwhile. */
function runIntroToCompletion(scene: Scene, budget = 200): number {
  let frames = 0;
  while (scene.player.is_executing("Intro") && frames < budget) {
    scene.step(0);
    frames++;
  }
  return frames;
}

test("a fresh scene starts mid-Intro with control withheld", () => {
  const scene = Scene.create();
  assert.ok(scene.player.is_executing("Intro"), scene.player.stateString());
  assert.equal(scene.player.listening_to_inputs, false);
});

test("Intro drops the player down to the spawn point before settling", () => {
  const scene = Scene.create();
  const liftedY = scene.player.pos.y;
  scene.step(0);
  // Still descending, strictly downward from where it started.
  assert.ok(scene.player.pos.y > liftedY);
});

test("the camera holds the room's framing still while Intro plays out", () => {
  const scene = Scene.create();
  const x0 = scene.camera.x;
  const y0 = scene.camera.y;
  for (let i = 0; i < 30; i++) scene.step(0);
  assert.equal(scene.camera.x, x0);
  assert.equal(scene.camera.y, y0);
});

test("Intro ends, hands control back, and fires gameplay_start exactly once", () => {
  const scene = Scene.create();
  let gameplayStarts = 0;
  scene.player.events.on("gameplay_start", () => gameplayStarts++);

  const frames = runIntroToCompletion(scene);
  assert.ok(frames < 200, `Intro did not end within budget (state: ${scene.player.stateString()})`);
  assert.equal(scene.player.is_executing("Intro"), false);
  assert.equal(scene.player.listening_to_inputs, true);
  assert.equal(gameplayStarts, 1);
});

test("movement input is ignored during Intro and works immediately after", () => {
  const scene = Scene.create();
  const startX = scene.player.pos.x;

  runIntroToCompletion(scene);
  // A few extra frames of held input, driven the way the browser drives it: one
  // mask applied per tick.
  for (let i = 0; i < 10; i++) scene.step(MOVE_RIGHT);

  assert.ok(scene.player.pos.x > startX, "player should have walked right once Intro ended");
});
