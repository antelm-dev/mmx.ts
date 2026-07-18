import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Camera } from '../src/engine/Camera.js';
import { DT, VIEW_WIDTH, VIEW_HEIGHT } from '../src/core/constants.js';

// A world comfortably larger than the view on both axes, so clamping is not what
// is being measured except in the tests that ask for it.
const WORLD_W = 1600;
const WORLD_H = 512;

function makeCamera(): Camera {
  return new Camera(WORLD_W, WORLD_H);
}

/** Run `follow` until it stops moving, or fail if it never settles. */
function settle(cam: Camera, tx: number, ty: number, steps = 600): void {
  for (let i = 0; i < steps; i++) cam.follow(tx, ty, DT);
}

test('snapTo centres the view on the target', () => {
  const cam = makeCamera();
  cam.snapTo(800, 256);
  assert.equal(cam.centerX, 800);
  assert.equal(cam.centerY, 256);
  assert.equal(cam.x, 800 - VIEW_WIDTH / 2);
  assert.equal(cam.y, 256 - VIEW_HEIGHT / 2);
});

test('the view never leaves the world bounds', () => {
  const cam = makeCamera();

  cam.snapTo(0, 0);
  assert.equal(cam.x, 0);
  assert.equal(cam.y, 0);

  cam.snapTo(WORLD_W, WORLD_H);
  assert.equal(cam.x, WORLD_W - VIEW_WIDTH);
  assert.equal(cam.y, WORLD_H - VIEW_HEIGHT);
});

test('an axis smaller than the view is centred rather than clamped to zero', () => {
  // A world narrower than the screen: the overflow must be split evenly, not
  // dumped on one side, which is what a plain clamp to [0, max] would do.
  const narrow = new Camera(VIEW_WIDTH - 100, WORLD_H);
  narrow.snapTo(0, 256);
  assert.equal(narrow.x, -50);
});

test('a target inside the dead zone does not move the camera', () => {
  const cam = makeCamera();
  cam.snapTo(800, 256);

  // Well inside the dead zone half-extents (24 x 32).
  settle(cam, 800 + 20, 256 + 28);
  assert.equal(cam.centerX, 800);
  assert.equal(cam.centerY, 256);
});

test('a target outside the dead zone is followed until it sits on the edge', () => {
  const cam = makeCamera();
  cam.snapTo(800, 256);

  settle(cam, 1000, 256);
  // The camera stops once the target rests on the dead zone's edge, not centred.
  assert.equal(cam.centerX, 1000 - 24);
  assert.equal(cam.centerY, 256);
});

test('following eases rather than teleporting', () => {
  const cam = makeCamera();
  cam.snapTo(800, 256);

  cam.follow(1000, 256, DT);
  assert.ok(cam.centerX > 800, 'camera did not move toward the target');
  assert.ok(cam.centerX < 1000 - 24, 'camera reached its goal in a single step');
});

test('the follow rate is independent of step size', () => {
  const coarse = makeCamera();
  const fine = makeCamera();
  coarse.snapTo(800, 256);
  fine.snapTo(800, 256);

  // One 1/60s step against four 1/240s steps must land in the same place, or
  // scrolling speed would drift with the frame rate.
  coarse.follow(1200, 256, DT);
  for (let i = 0; i < 4; i++) fine.follow(1200, 256, DT / 4);

  assert.ok(Math.abs(coarse.centerX - fine.centerX) < 0.001, `${coarse.centerX} vs ${fine.centerX}`);
});

test('following a target past the world edge stops at the edge', () => {
  const cam = makeCamera();
  cam.snapTo(800, 256);

  settle(cam, WORLD_W + 500, WORLD_H + 500);
  assert.equal(cam.x, WORLD_W - VIEW_WIDTH);
  assert.equal(cam.y, WORLD_H - VIEW_HEIGHT);
});

test('the camera settles exactly instead of drifting forever', () => {
  const cam = makeCamera();
  cam.snapTo(800, 256);

  settle(cam, 1000, 400);
  const { x, y } = cam;
  cam.follow(1000, 400, DT);
  assert.equal(cam.x, x, 'x still creeping after settling');
  assert.equal(cam.y, y, 'y still creeping after settling');
});
