import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Input } from '../src/core/Input.js';
import {
  DT,
  ENEMY_STATS,
  HIDE_OPEN_DELAY,
  PLAYER_HIT_INVULNERABILITY,
  STUN_DURATION,
} from '../src/core/constants.js';
import { Player } from '../src/engine/Player.js';
import { Stage } from '../src/engine/Stage.js';
import { World } from '../src/engine/World.js';
import { makeBat, makeMetool } from '../src/engine/enemies/index.js';
import type { Enemy } from '../src/engine/Enemy.js';

/**
 * These run without any clip data loaded, which is the same deal the movement
 * tests get: with no frames, AnimationPlayer reports every clip finished on the
 * next tick. The state machines still sequence correctly — that is the point of
 * making clip data optional — they simply pass through the animation-gated beats
 * (Hide's "open", Stun's recovery) in one frame instead of several.
 */

const GROUND_ROW = 10;
const FLOOR_Y = GROUND_ROW * 16;

/** A long flat room with walls at both ends. */
function room(): World {
  const rows: string[] = [];
  for (let y = 0; y < GROUND_ROW; y++) rows.push('#' + '.'.repeat(78) + '#');
  rows.push('#'.repeat(80));
  return World.fromRows(rows);
}

/** Stage with the player parked far away, out of every vision box. */
function makeStage(playerX = 70 * 16) {
  const world = room();
  const input = new Input();
  const player = new Player(world, playerX, FLOOR_Y - 14, input);
  const stage = new Stage(world, player);
  return { world, input, player, stage };
}

function grounded(kind: 'metool', x: number, world: World, facing = -1): Enemy {
  return makeMetool(world, x, FLOOR_Y - ENEMY_STATS[kind].hh, facing, 1234);
}

function run(stage: Stage, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) stage.tick(DT);
}

// --- patrol ------------------------------------------------------------------

test('an unaware Metool paces back and forth', () => {
  const { world, stage } = makeStage();
  const metool = stage.add(grounded('metool', 20 * 16, world));
  const startX = metool.pos.x;

  let minX = Infinity;
  let maxX = -Infinity;
  const facings = new Set<number>();
  for (let i = 0; i < Math.round(10 / DT); i++) {
    stage.tick(DT);
    minX = Math.min(minX, metool.pos.x);
    maxX = Math.max(maxX, metool.pos.x);
    facings.add(metool.get_facing_direction());
  }

  // Each leg is travel_time * travel_speed = 0.8 * 25 = 20px, less the 0.05s
  // the turn takes before the walk starts. The pacing is anchored at the spawn
  // rather than centred on it: Patrol reverses on every restart, so the Metool
  // walks out one leg and the next leg brings it straight back.
  const span = maxX - minX;
  assert.ok(span > 15 && span < 25, `expected a ~19px beat, got ${span.toFixed(1)}`);
  assert.ok(Math.abs(minX - startX) < 1, 'one end of the beat is where it spawned');
  assert.deepEqual([...facings].sort(), [-1, 1], 'and it turns around at both ends');
  assert.ok(metool.is_on_floor(), 'a patrolling Metool stays on the ground');
});

test('a patrolling Metool turns at a wall instead of grinding into it', () => {
  const { world, stage } = makeStage();
  // Two tiles from the left wall, already facing it.
  const metool = stage.add(grounded('metool', 3 * 16, world, -1));

  run(stage, 6);

  assert.ok(metool.pos.x > 16, 'never walks into the wall tile');
  assert.ok(metool.pos.x < 20 * 16, 'and does not run away across the room');
});

// --- the shield --------------------------------------------------------------

test('a Metool that sees the player hides, and cannot be damaged while hidden', () => {
  const { world, stage, player } = makeStage();
  const metool = stage.add(grounded('metool', 24 * 16, world));
  // Well inside the 158px vision box, and facing him so he is not "looking away".
  player.pos.x = metool.pos.x + 60;
  player.set_direction(-1);
  player.update_facing_direction();

  run(stage, 0.2);

  assert.ok(metool.is_executing('Hide'), 'Hide takes over from the patrol');
  assert.equal(metool.has_shield(), true);
  assert.equal(metool.can_be_damaged(), false);

  const before = metool.current_health;
  metool.damage(1);
  assert.equal(metool.current_health, before, 'the helmet absorbs it entirely');
});

test('a Metool opens up once the player looks away, and is vulnerable then', () => {
  const { world, stage, player } = makeStage();
  const metool = stage.add(grounded('metool', 24 * 16, world));
  player.pos.x = metool.pos.x + 60;
  // Facing right, i.e. away from a Metool standing to his left.
  player.set_direction(1);
  player.update_facing_direction();
  // Hold him there: with no input the player would settle, but `direction` is
  // re-read from input each tick, so re-assert it every frame below.

  for (let i = 0; i < Math.round((HIDE_OPEN_DELAY + 0.5) / DT); i++) {
    player.set_direction(1);
    player.update_facing_direction();
    stage.tick(DT);
  }

  assert.equal(metool.has_shield(), false, 'the helmet is up, so the guard is down');
  assert.equal(metool.can_be_damaged(), true);
});

// --- guard break -------------------------------------------------------------

test('a charged shot breaks the guard and stuns; a lemon does not', () => {
  const { world, stage, player } = makeStage();
  const metool = stage.add(grounded('metool', 24 * 16, world));
  player.pos.x = metool.pos.x + 60;
  player.set_direction(-1);
  player.update_facing_direction();
  run(stage, 0.2);
  assert.equal(metool.has_shield(), true, 'precondition: hidden');

  // An uncharged shot bounces off.
  assert.equal(metool.hit_shield(false), false);
  assert.equal(metool.has_shield(), true);

  // A charged one breaks it, and the AI answers the break with a stun.
  assert.equal(metool.hit_shield(true), true);
  stage.tick(DT);
  assert.ok(metool.is_executing('Stun'), 'guard break routes to Stun');
  assert.equal(metool.has_shield(), false);
  assert.equal(metool.can_be_damaged(), true, 'a stunned Metool is wide open');

  // The stun holds it for its full duration.
  run(stage, STUN_DURATION - 0.2);
  assert.ok(metool.is_executing('Stun'), 'still stunned before the timer is up');
  run(stage, 0.4);
  assert.equal(metool.is_executing('Stun'), false, 'and releases afterwards');
});

test('a stun does not hand the guard back when it ends', () => {
  // Checked with nobody in sight, because a Metool that can still see the player
  // re-raises its guard the moment the stun releases it — via Hide, which is the
  // AI reacting, not EnemyStun restoring anything (reactivate_shield_on_end is
  // false on this scene). Those two are only distinguishable in isolation.
  const { world, stage } = makeStage();
  const metool = stage.add(grounded('metool', 24 * 16, world));
  run(stage, 0.2);

  metool.activate_shield();
  assert.equal(metool.hit_shield(true), true);
  stage.tick(DT);
  assert.ok(metool.is_executing('Stun'));

  run(stage, STUN_DURATION + 0.4);
  assert.equal(metool.is_executing('Stun'), false, 'the stun ended');
  assert.equal(metool.has_shield(), false, 'and left the guard broken');
});

// --- damage and death --------------------------------------------------------

test('an exposed Metool dies to two lemons and is reaped afterwards', () => {
  const { world, stage } = makeStage();
  const metool = stage.add(grounded('metool', 24 * 16, world));
  run(stage, 0.2);
  assert.equal(metool.has_shield(), false, 'nobody in sight, so it just patrols');

  metool.damage(1);
  assert.equal(metool.current_health, 1);
  assert.ok(metool.has_health(), 'one lemon is not enough');

  metool.damage(1);
  assert.equal(metool.has_health(), false);

  stage.tick(DT);
  assert.ok(metool.is_executing('Death'), 'zero health starts the death sequence');
  assert.equal(metool.ai.active, false, 'and the AI switches itself off');

  // EnemyDeath frees the node a second after the blast.
  run(stage, 0.5);
  assert.deepEqual(stage.enemies, [metool], 'the corpse lingers while it plays out');
  run(stage, 0.8);
  assert.deepEqual(stage.enemies, [], 'and is then removed from the stage');
});

test('a fired shot damages an unshielded enemy exactly once', () => {
  // Against a bat, which has no guard to complicate it — a Metool close enough
  // to shoot at is by definition close enough to have already hidden.
  const { world, stage, player, input } = makeStage();
  const bat = stage.add(makeBat(world, 24 * 16, FLOOR_Y - 60, -1, 99));
  bat.max_health = 10;
  bat.current_health = 10;

  player.pos.x = bat.pos.x + 60;
  player.pos.y = bat.pos.y;
  player.set_direction(-1);
  player.update_facing_direction();
  input.setDown('fire', true);
  stage.tick(DT);
  input.setDown('fire', false);

  const health = bat.current_health;
  run(stage, 0.5);

  assert.ok(bat.current_health < health, 'the shot connected');
  assert.equal(
    bat.current_health,
    health - 1,
    'and spent itself doing so, rather than damaging on every frame of overlap',
  );
  assert.equal(
    player.projectiles.filter((p) => p.isLive).length,
    0,
    'the projectile is spent, not still flying',
  );
});

test('a real charged shot breaks the guard through the stage', () => {
  // The shield tests above call hit_shield directly; this one goes through the
  // whole path — a live projectile, its charge level, and the stage's overlap
  // check — because "which shots break guards" is decided in Stage, not Enemy.
  const { world, stage, player } = makeStage();
  const metool = stage.add(grounded('metool', 24 * 16, world));
  player.pos.x = metool.pos.x + 60;
  player.pos.y = metool.pos.y;
  player.set_direction(-1);
  player.update_facing_direction();
  run(stage, 0.2);
  assert.equal(metool.has_shield(), true, 'precondition: hidden');

  player.spawnBuster(2); // Charge.gd's charged-buster level
  run(stage, 0.5);

  assert.equal(metool.has_shield(), false, 'the charged shot broke the guard');
  assert.ok(metool.is_executing('Stun'), 'and the AI answered the break with a stun');
});

test('a raised shield consumes a lemon without taking damage', () => {
  const { world, stage, player } = makeStage();
  const metool = stage.add(grounded('metool', 24 * 16, world));
  player.pos.x = metool.pos.x + 60;
  player.set_direction(-1);
  player.update_facing_direction();
  run(stage, 0.2);
  assert.equal(metool.has_shield(), true, 'precondition: hidden behind the helmet');

  const health = metool.current_health;
  player.spawnBuster(0);
  run(stage, 0.5);

  assert.equal(metool.current_health, health, 'the helmet took it');
  assert.equal(metool.has_shield(), true, 'and an uncharged shot does not break it');
  assert.equal(
    player.projectiles.filter((p) => p.isLive).length,
    0,
    'the shot was still consumed',
  );
});

// --- contact damage ----------------------------------------------------------

test('touching an enemy costs health once, then the player is briefly immune', () => {
  const { world, stage, player } = makeStage();
  const metool = stage.add(grounded('metool', 24 * 16, world));
  player.pos.x = metool.pos.x;
  player.pos.y = metool.pos.y;

  const full = player.current_health;
  stage.tick(DT);

  assert.equal(player.current_health, full - ENEMY_STATS.metool.touch_damage);
  assert.ok(player.is_invulnerable(), 'the hit grants i-frames');

  // Standing inside it for the rest of the window costs nothing more.
  const after = player.current_health;
  for (let i = 0; i < 10; i++) {
    player.pos.x = metool.pos.x;
    player.pos.y = metool.pos.y;
    stage.tick(DT);
  }
  assert.equal(player.current_health, after, 'contact does not drain per frame');

  // Once the window lapses, it can hit again.
  run(stage, PLAYER_HIT_INVULNERABILITY);
  player.pos.x = metool.pos.x;
  player.pos.y = metool.pos.y;
  stage.tick(DT);
  assert.ok(player.current_health < after, 'and connects again afterwards');
});

// --- the bat -----------------------------------------------------------------

test('a bat hovers near its anchor until the player comes into range', () => {
  const { world, stage } = makeStage();
  const bat = stage.add(makeBat(world, 20 * 16, 5 * 16, -1, 99));
  const anchorX = bat.pos.x;
  const anchorY = bat.pos.y;

  run(stage, 5);

  assert.ok(bat.is_executing('Hover'), 'it idles rather than chasing');
  assert.ok(Math.abs(bat.pos.x - anchorX) <= 20, `drifted to ${bat.pos.x} from ${anchorX}`);
  assert.ok(Math.abs(bat.pos.y - anchorY) <= 20, `drifted to ${bat.pos.y} from ${anchorY}`);
});

test('a bat chases the player, and gives up past its range', () => {
  const { world, stage, player } = makeStage();
  const bat = stage.add(makeBat(world, 20 * 16, 5 * 16, -1, 99));
  // Inside the vision box (102 x 86.5) and to the bat's right.
  player.pos.x = bat.pos.x + 80;
  player.pos.y = bat.pos.y + 20;

  const gap = Math.abs(player.pos.x - bat.pos.x);
  run(stage, 0.5);

  assert.ok(bat.is_executing('Pursuit'), 'seeing the player starts the chase');
  assert.ok(
    Math.abs(player.pos.x - bat.pos.x) < gap,
    'and the chase actually closes the distance',
  );

  // Teleport the player well beyond the give-up range.
  player.pos.x = bat.pos.x + 600;
  run(stage, 0.2);
  assert.equal(bat.is_executing('Pursuit'), false, 'it does not follow forever');
});

test('a bat that touches the player recoils upward', () => {
  const { world, stage, player } = makeStage();
  const bat = stage.add(makeBat(world, 20 * 16, 5 * 16, -1, 99));
  player.pos.x = bat.pos.x;
  player.pos.y = bat.pos.y;

  stage.tick(DT);
  assert.ok(bat.is_executing('Recoil'), 'contact triggers the hop');

  const y = bat.pos.y;
  run(stage, 0.3);
  assert.ok(bat.pos.y < y, `expected to rise from ${y}, ended at ${bat.pos.y}`);
});

test('a bat dies to a single hit', () => {
  const { world, stage } = makeStage();
  const bat = stage.add(makeBat(world, 20 * 16, 5 * 16, -1, 99));
  run(stage, 0.2);

  bat.damage(1);
  assert.equal(bat.has_health(), false, 'one health means one hit');
});

// --- ability conflicts -------------------------------------------------------

test('Hide interrupts a running Patrol, and Patrol cannot start underneath it', () => {
  const { world, stage, player } = makeStage();
  const metool = stage.add(grounded('metool', 24 * 16, world));
  run(stage, 0.2);
  assert.ok(metool.is_executing('Patrol'), 'precondition: patrolling');

  player.pos.x = metool.pos.x + 60;
  player.set_direction(-1);
  player.update_facing_direction();
  stage.tick(DT);

  assert.ok(metool.is_executing('Hide'), 'Hide took over');
  assert.equal(metool.is_executing('Patrol'), false, 'and the patrol was interrupted');

  run(stage, 1);
  assert.equal(metool.is_executing('Patrol'), false, 'the patrol stays out while hiding');
});

test('Stun interrupts everything and blocks it from restarting', () => {
  const { world, stage } = makeStage();
  const metool = stage.add(grounded('metool', 24 * 16, world));
  run(stage, 0.2);
  assert.ok(metool.is_executing('Patrol'));

  metool.activate_shield();
  metool.hit_shield(true);
  stage.tick(DT);

  assert.ok(metool.is_executing('Stun'));
  assert.equal(metool.is_executing('Patrol'), false, 'the patrol was interrupted');

  run(stage, 0.5);
  assert.equal(metool.is_executing('Patrol'), false, 'and cannot restart mid-stun');
  assert.equal(metool.get_horizontal_speed(), 0, 'a stunned enemy holds still');
});
