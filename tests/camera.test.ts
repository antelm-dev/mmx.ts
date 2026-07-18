import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Camera, type CameraZone } from '../src/engine/Camera.js';
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

// --- camera zones ---------------------------------------------------------
//
// A zone is a rectangle of the level the view is confined to while the player
// is inside it, which is how the originals frame a room independently of how
// much empty space happens to surround it.

function zoned(...zones: CameraZone[]): Camera {
  const cam = makeCamera();
  cam.setZones(zones);
  return cam;
}

test('the view stays inside the active zone even where the world allows more', () => {
  // Inset from the world's left edge, so world-bounds clamping alone would not
  // produce this answer: it would let the view slide on to x = 245.
  const cam = zoned({ x: 400, y: 0, w: 800, h: WORLD_H });
  cam.snapTo(800, 256);

  settle(cam, 420, 256);
  assert.equal(cam.x, 400, 'view scrolled past the zone edge');
});

test('a zone smaller than the view on an axis centres the view on it', () => {
  // A 100px-tall band cannot fill 224 scanlines, so the overflow is split
  // evenly rather than dumped above or below the band.
  const cam = zoned({ x: 0, y: 300, w: WORLD_W, h: 100 });
  cam.snapTo(800, 350);
  assert.equal(cam.centerY, 350);

  settle(cam, 800, 396);
  assert.equal(cam.centerY, 350, 'a short zone did not stay centred');
});

test('an unbound axis scrolls freely while the other stays locked', () => {
  // The corridor case: hold the vertical framing, let the player run its length.
  const cam = zoned({ x: 0, y: 256, w: WORLD_W, h: 256, bindX: false });
  cam.snapTo(200, 400);

  settle(cam, 1400, 500);
  assert.equal(cam.centerX, 1400 - 24, 'horizontal scrolling was constrained');
  assert.equal(cam.centerY, 512 - 112, 'vertical lock was not applied');
});

test('crossing into a new zone scrolls rather than cutting', () => {
  const left: CameraZone = { x: 0, y: 0, w: 800, h: 224 };
  const right: CameraZone = { x: 800, y: 288, w: 800, h: 224 };
  const cam = zoned(left, right);

  cam.snapTo(400, 112);
  assert.equal(cam.y, 0);

  // One step after the crossing the camera must be on its way to the new zone's
  // framing, not already sitting in it — a hard clamp would teleport it.
  cam.follow(900, 400, DT);
  assert.ok(cam.centerY > 112, 'camera did not start moving to the new zone');
  assert.ok(cam.centerY < 400, 'camera cut straight to the new zone');

  settle(cam, 900, 400);
  assert.equal(cam.centerY, 400, 'camera never finished arriving');
});

test('an overlap keeps the zone already in force', () => {
  const first: CameraZone = { x: 0, y: 0, w: 800, h: WORLD_H };
  const second: CameraZone = { x: 600, y: 0, w: 800, h: WORLD_H };
  const cam = zoned(first, second);

  cam.snapTo(300, 256);
  assert.equal(cam.activeZone, first);

  // 700 is inside both. Whichever zone was already active must win, or the two
  // would trade control frame to frame while the player stands on the seam.
  settle(cam, 700, 256);
  assert.equal(cam.activeZone, first);

  settle(cam, 1300, 256);
  assert.equal(cam.activeZone, second, 'never handed over on leaving the first');

  settle(cam, 700, 256);
  assert.equal(cam.activeZone, second, 'handed back inside the overlap');
});

test('a target between zones keeps the last one instead of unlocking', () => {
  const cam = zoned(
    { x: 0, y: 0, w: 400, h: WORLD_H },
    { x: 1000, y: 0, w: 400, h: WORLD_H },
  );
  cam.snapTo(200, 256);

  settle(cam, 700, 256);
  assert.equal(cam.x, 400 - VIEW_WIDTH, 'the gap released the zone lock');
});

test('a zone hugging the level floor still cannot show past it', () => {
  // 128px tall, flush with the bottom of the world: too short for the view, so
  // centring on it alone would put 64px of nothing below the level.
  const cam = zoned({ x: 0, y: WORLD_H - 128, w: WORLD_W, h: 128 });
  cam.snapTo(800, WORLD_H - 64);

  settle(cam, 800, WORLD_H - 16);
  assert.equal(cam.y, WORLD_H - VIEW_HEIGHT, 'view fell off the bottom of the level');
});

test('with no zones the camera behaves exactly as before', () => {
  const cam = zoned();
  cam.snapTo(800, 256);

  settle(cam, 1000, 256);
  assert.equal(cam.centerX, 1000 - 24);

  settle(cam, WORLD_W + 500, WORLD_H + 500);
  assert.equal(cam.x, WORLD_W - VIEW_WIDTH);
  assert.equal(cam.y, WORLD_H - VIEW_HEIGHT);
});
