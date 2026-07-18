import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Input, Action } from '../src/core/Input.js';
import { DT, BUSTER_SHOTS, MAX_SHOTS_ALIVE, SHOT_POSITION } from '../src/core/constants.js';
import { Player } from '../src/engine/Player.js';
import { Projectile } from '../src/engine/Projectile.js';
import { World } from '../src/engine/World.js';
import { Rng } from '../src/core/Rng.js';

/** A long open room, so shots have somewhere to fly without meeting a wall. */
function openRoom(): World {
  const rows: string[] = [];
  for (let y = 0; y < 11; y++) rows.push('#' + '.'.repeat(78) + '#');
  rows.push('#'.repeat(80));
  return World.fromRows(rows);
}

function makePlayer() {
  const input = new Input();
  const world = openRoom();
  const player = new Player(world, 5 * 16, 10 * 16, input);
  for (let i = 0; i < 5; i++) player.tick(DT);
  return { input, world, player };
}

function hold(input: Input, action: Action, down: boolean) {
  input.setDown(action, down);
}

/** One tap of fire: press for a frame, release, then let the shot get moving. */
function tap(input: Input, player: Player, gap = 4) {
  hold(input, 'fire', true);
  player.tick(DT);
  hold(input, 'fire', false);
  for (let i = 0; i < gap; i++) player.tick(DT);
}

test('a tap of fire spawns exactly one lemon', () => {
  const { input, player } = makePlayer();
  tap(input, player);

  assert.equal(player.projectiles.length, 1);
  assert.equal(player.projectiles[0].kind, 'lemon');
  assert.equal(player.projectiles[0].damage, BUSTER_SHOTS[0].damage);
});

test('the buster caps how many lemons can be in flight at once', () => {
  const { input, player } = makePlayer();

  // Fire well past the cap. Weapon.gd:can_shoot is what gives buster fire its
  // rhythm — without it a mashed fire button is a continuous stream.
  for (let i = 0; i < MAX_SHOTS_ALIVE + 4; i++) tap(input, player, 3);

  const live = player.projectiles.filter((p) => p.isLive);
  assert.equal(live.length, MAX_SHOTS_ALIVE, 'never more than the cap in flight');
});

test('a shot that flies off screen frees up a slot for the next one', () => {
  const { input, player } = makePlayer();
  for (let i = 0; i < MAX_SHOTS_ALIVE; i++) tap(input, player, 3);
  assert.equal(player.projectiles.filter((p) => p.isLive).length, MAX_SHOTS_ALIVE);

  // Let the volley clear the room.
  for (let i = 0; i < 240; i++) player.tick(DT);
  assert.equal(player.projectiles.length, 0, 'shots expired off the end of the room');

  tap(input, player);
  assert.equal(player.projectiles.length, 1, 'firing works again once the cap clears');
});

test('shots leave the muzzle, and the muzzle follows the pose', () => {
  const { input, player } = makePlayer();

  const idle = player.get_shot_position();
  assert.equal(idle.x - player.pos.x, SHOT_POSITION.x, 'idle fires from the base offset');

  // Walking pushes the cannon further forward (Walk.gd shot_pos_adjust).
  hold(input, 'move_right', true);
  for (let i = 0; i < 10; i++) player.tick(DT);
  const walking = player.get_shot_position();
  assert.ok(
    walking.x - player.pos.x > SHOT_POSITION.x,
    'the walking muzzle reaches out past the idle one',
  );

  // ...and it mirrors with facing rather than staying pinned to one side.
  hold(input, 'move_right', false);
  hold(input, 'move_left', true);
  for (let i = 0; i < 10; i++) player.tick(DT);
  assert.ok(player.get_shot_position().x < player.pos.x, 'facing left fires leftward');
});

test('charge level picks the heavier projectile, and never overruns the shot table', () => {
  const { input, player } = makePlayer();
  hold(input, 'fire', true);
  for (let i = 0; i < 400; i++) player.tick(DT); // hold well past every threshold
  hold(input, 'fire', false);
  player.tick(DT);

  const shot = player.projectiles.find((p) => p.charge > 0);
  assert.ok(shot, 'a charged shot came out');
  // Charge.gd can report a level the buster has no projectile for; it must clamp
  // onto the heaviest that exists rather than index off the end.
  assert.equal(shot.kind, 'charged');
  assert.equal(shot.damage, BUSTER_SHOTS[BUSTER_SHOTS.length - 1].damage);
});

test('an overcharged level clamps onto the last shot in the table', () => {
  const wild = new Projectile(0, 0, 1, 99);
  assert.equal(wild.kind, 'charged');
  assert.equal(wild.charge, BUSTER_SHOTS.length - 1);
});

test('a charged shot outruns a lemon and hits harder', () => {
  const lemon = new Projectile(0, 0, 1, 0);
  const charged = new Projectile(0, 0, 1, 2);
  assert.ok(Math.abs(charged.vx) > Math.abs(lemon.vx), 'charged shots fly faster');
  assert.ok(charged.damage > lemon.damage, 'and hit harder');
  assert.ok(charged.bounds.right - charged.bounds.left > 0, 'has a damage box');
});

test('a spent shot stops colliding but still reports where it landed', () => {
  const world = openRoom();
  const p = new Projectile(100, 50, 1, 0);
  p.update(DT, world);
  const travelled = p.x;

  p.hit(travelled, 50);
  assert.equal(p.isLive, false, 'a spent shot cannot hit anything else');
  assert.equal(p.hitX, travelled, 'the effect plays at the impact point');
  assert.equal(p.emittedHitParticle, true);

  // Hitting twice must not restart the effect or extend its life.
  p.hit(999, 999);
  assert.equal(p.hitX, travelled, 'the impact point is recorded once');
});

test('the same seed replays identically', () => {
  const volley = (seed: number) => {
    const rng = new Rng(seed);
    return Array.from({ length: 8 }, () => {
      const p = new Projectile(100, 50, 1, 0, rng);
      return [p.y, p.frame, p.hitFlipV] as const;
    });
  };
  // The whole reason randomness is seeded rather than ambient: the headless sim
  // and these tests replay a scripted timeline and must produce the same trace.
  assert.deepEqual(volley(42), volley(42), 'same seed, same volley');
  assert.notDeepEqual(volley(42), volley(7), 'different seeds actually differ');
});

test('lemons fired back to back are drawn out of sync with each other', () => {
  const rng = new Rng(1);
  // Lemon.references_setup randomises the start frame. Without it a stream of
  // shots spins in lockstep and reads as one rigid object rather than several.
  const frames = Array.from({ length: 12 }, () => new Projectile(0, 0, 1, 0, rng).frame);
  assert.ok(new Set(frames).size > 1, 'start frames vary');
  assert.ok(
    frames.every((f) => f >= 0 && f < 8),
    'and stay inside the 8-frame sheet',
  );

  // The charged shot is the exception: one big shot, no need to desync it.
  assert.equal(new Projectile(0, 0, 1, 2, new Rng(1)).frame, 0);
});

test('spawn height is not scattered at the buster\'s range', () => {
  // Documents a quirk rather than a feature: WeaponShot truncates its jitter to
  // an int, so range 1 always yields 0. Kept faithful — see Projectile.ts.
  const rng = new Rng(3);
  const ys = Array.from({ length: 10 }, () => new Projectile(0, 50, 1, 0, rng).y);
  assert.ok(
    ys.every((y) => y === 50),
    'lemons leave the cannon perfectly level',
  );
});
