import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Input, Action } from '../src/core/Input.js';
import { DT, WALK_SPEED, JUMP_VELOCITY } from '../src/core/constants.js';
import { Player } from '../src/engine/Player.js';
import { World } from '../src/engine/World.js';

// A flat 30x12 room with a solid floor on the bottom row and a wall on the right.
function flatRoom(): World {
  const rows: string[] = [];
  for (let y = 0; y < 11; y++) rows.push('#' + '.'.repeat(28) + '#');
  rows.push('#'.repeat(30));
  return World.fromRows(rows);
}

function makePlayer() {
  const input = new Input();
  const world = flatRoom();
  // stand on the floor: floor top = 11*16 = 176, body half-h 14 -> center ~162
  const player = new Player(world, 5 * 16, 10 * 16, input);
  // settle a few frames onto the floor
  for (let i = 0; i < 5; i++) player.tick(DT);
  return { input, world, player };
}

function hold(input: Input, a: Action, on: boolean) {
  input.setDown(a, on);
}

test('spawns and settles onto the floor in Idle', () => {
  const { player } = makePlayer();
  assert.equal(player.is_on_floor(), true);
  assert.ok(player.is_executing('Idle'), 'should be idle: ' + player.stateString());
  assert.equal(Math.round(player.velocity.x), 0);
});

test('walking moves right at ~WALK_SPEED and faces right', () => {
  const { input, player } = makePlayer();
  hold(input, 'move_right', true);
  for (let i = 0; i < 30; i++) player.tick(DT);
  assert.ok(player.is_executing('Walk'), 'state=' + player.stateString());
  // after the slow-start window the horizontal speed reaches full walk speed
  assert.ok(Math.abs(player.velocity.x - WALK_SPEED) < 1e-6);
  assert.equal(player.get_facing_direction(), 1);
});

test('jump gives an initial upward velocity and returns to the floor', () => {
  const { input, player } = makePlayer();
  const startY = player.pos.y;
  hold(input, 'jump', true);
  player.tick(DT);
  assert.ok(player.is_executing('Jump'), 'state=' + player.stateString());
  assert.ok(player.velocity.y < 0, 'should be moving up');
  assert.ok(Math.abs(player.velocity.y) <= JUMP_VELOCITY + 1e-6);

  // hold up briefly then release, and let it fall back down
  for (let i = 0; i < 10; i++) player.tick(DT);
  assert.ok(player.pos.y < startY, 'should have risen above start');
  hold(input, 'jump', false);
  for (let i = 0; i < 120; i++) player.tick(DT);
  assert.ok(player.is_on_floor(), 'should land again');
});

test('a short (tapped) jump rises less than a held jump', () => {
  function apex(holdFrames: number): number {
    const { input, player } = makePlayer();
    const startY = player.pos.y;
    hold(input, 'jump', true);
    let minY = startY;
    for (let i = 0; i < 60; i++) {
      if (i === holdFrames) hold(input, 'jump', false);
      player.tick(DT);
      minY = Math.min(minY, player.pos.y);
    }
    return startY - minY; // peak height
  }
  const shortHop = apex(2);
  const fullJump = apex(40);
  assert.ok(fullJump > shortHop + 4, `full=${fullJump} short=${shortHop}`);
});

test('cannot jump after walking off a ledge', () => {
  const rows = Array.from({ length: 11 }, () => '#'.padEnd(19, '.').concat('#'));
  rows.push('#'.repeat(9).padEnd(19, '.').concat('#'));
  const input = new Input();
  const player = new Player(World.fromRows(rows), 6 * 16, 10 * 16, input);

  for (let i = 0; i < 5; i++) player.tick(DT);
  input.setDown('move_right', true);
  for (let i = 0; i < 120 && player.is_on_floor(); i++) player.tick(DT);
  assert.equal(player.is_on_floor(), false, 'player should have left the ledge');

  input.setDown('jump', true);
  player.tick(DT);
  assert.equal(player.is_executing('Jump'), false, 'jump must require current floor contact');
  assert.ok(player.velocity.y >= 0, 'player should continue falling');
});

test('dash reaches a higher speed than walking', () => {
  const { input, player } = makePlayer();
  hold(input, 'move_right', true);
  hold(input, 'dash', true);
  player.tick(DT);
  assert.ok(player.is_executing('Dash'), 'state=' + player.stateString());
  for (let i = 0; i < 5; i++) player.tick(DT);
  assert.ok(Math.abs(player.velocity.x) > WALK_SPEED + 1, 'dash faster than walk');
});

test('firing spawns a buster projectile travelling in the facing direction', () => {
  const { input, player } = makePlayer();
  assert.equal(player.projectiles.length, 0);
  hold(input, 'fire', true);
  player.tick(DT);
  hold(input, 'fire', false);
  player.tick(DT);
  assert.equal(player.projectiles.length, 1);
  const p = player.projectiles[0];
  assert.ok(p.vx > 0, 'shot moves right when facing right');
});

test('holds into a wall to wall-slide, then jumps to wall-kick', () => {
  const rows: string[] = [];
  for (let y = 0; y < 14; y++) rows.push('#' + '.'.repeat(28) + '#');
  rows.push('#'.repeat(30));
  const world = World.fromRows(rows);
  const input = new Input();
  const player = new Player(world, 28 * 16, 3 * 16, input); // airborne near right wall

  input.setDown('move_right', true); // press into the wall while falling
  let sawSlide = false;
  for (let i = 0; i < 120 && !sawSlide; i++) {
    player.tick(DT);
    if (player.is_executing('WallSlide')) sawSlide = true;
  }
  assert.ok(sawSlide, 'should wall-slide, state=' + player.stateString());

  input.setDown('jump', true); // wall-kick
  player.tick(DT);
  player.tick(DT);
  assert.ok(player.is_executing('WallJump'), 'should wall-jump, state=' + player.stateString());

  for (let i = 0; i < 12; i++) player.tick(DT); // clear the start delay
  assert.ok(player.velocity.y < 0, 'wall-jump should rise');
});

test('holding dash while wall-kicking performs a DashWallJump (faster kick-off)', () => {
  const rows: string[] = [];
  for (let y = 0; y < 14; y++) rows.push('#' + '.'.repeat(28) + '#');
  rows.push('#'.repeat(30));
  const world = World.fromRows(rows);
  const input = new Input();
  const player = new Player(world, 28 * 16, 3 * 16, input);

  input.setDown('move_right', true);
  input.setDown('dash', true); // hold dash the whole time
  let sawSlide = false;
  for (let i = 0; i < 120 && !sawSlide; i++) {
    player.tick(DT);
    if (player.is_executing('WallSlide')) sawSlide = true;
  }
  assert.ok(sawSlide, 'should wall-slide, state=' + player.stateString());

  input.setDown('jump', true); // dash held + jump -> DashWallJump (not plain WallJump)
  player.tick(DT);
  player.tick(DT);
  assert.ok(
    player.is_executing('DashWallJump'),
    'should dash-wall-jump, state=' + player.stateString(),
  );

  for (let i = 0; i < 12; i++) player.tick(DT);
  assert.ok(player.velocity.y < 0, 'dash-wall-jump should rise');
  // kicked away from the wall (to the left) at dash speed
  assert.ok(Math.abs(player.velocity.x) > WALK_SPEED + 1, 'dash-speed kick-off');
});

test('holding fire then releasing produces a charged shot (level > 0)', () => {
  const { input, player } = makePlayer();
  hold(input, 'fire', true);
  for (let i = 0; i < 130; i++) player.tick(DT); // > level 2 threshold
  const charge = player.get_ability('Charge') as any;
  assert.ok(charge.charged_time > 0.5, 'accumulated charge');
  hold(input, 'fire', false);
  player.tick(DT);
  const charged = player.projectiles.find((p) => p.charge > 0);
  assert.ok(charged, 'a charged projectile was fired');
});
