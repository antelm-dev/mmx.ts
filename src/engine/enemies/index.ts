import { Enemy, type EnemyKind } from '../Enemy.js';
import type { World } from '../World.js';
import { Death } from '../enemy/Death.js';
import { Hide } from '../enemy/Hide.js';
import { Hover } from '../enemy/Hover.js';
import { Patrol } from '../enemy/Patrol.js';
import { Pursuit } from '../enemy/Pursuit.js';
import { Recoil } from '../enemy/Recoil.js';
import { Stun } from '../enemy/Stun.js';

/**
 * The enemy scenes, as code — each function is the port of one .tscn's ability
 * node list plus the event wiring on its AI node.
 *
 * Read side by side, they are the argument for keeping AI.gd's event lists
 * instead of hard-coding transitions: the two enemies share every piece of
 * machinery and differ only in which ability answers which event.
 */

/**
 * Metool.tscn — the shielded ground enemy.
 *
 *   AI.on_idle        = [Patrol]
 *   AI.on_see_player  = [Hide]
 *   AI.on_guard_break = [EnemyStun]
 *
 * Note what is *not* wired: nothing answers on_get_hit, so a Metool that takes a
 * survivable hit does not flinch, and nothing answers on_touch_player, so
 * walking into one costs 3 health and does not otherwise perturb it. Both are
 * deliberate in the original — the Metool's only reaction is its guard.
 */
export function makeMetool(world: World, x: number, y: number, facing = -1, seed?: number): Enemy {
  const enemy = new Enemy('metool', world, x, y, facing, seed);

  enemy.add(new Patrol(enemy));
  enemy.add(new Hide(enemy));
  enemy.add(new Stun(enemy));
  enemy.add(new Death(enemy));

  // Metool.tscn's animatedSprite starts on "idle"; the AI raises Patrol on the
  // first frame, which is what actually puts it in motion.
  enemy.play_animation('idle');
  enemy.ai.configure({
    on_idle: ['Patrol'],
    on_see_player: ['Hide'],
    on_guard_break: ['Stun'],
  });
  return enemy;
}

/**
 * SmallBat.tscn — the 1-health flier.
 *
 *   AI.on_idle         = [BatPatrol]
 *   AI.on_see_player   = [BatPursuit]
 *   AI.on_touch_player = [BatJump]
 *
 * It has no shield and no stun: anything that reaches it kills it. The interest
 * is entirely in the movement.
 */
export function makeBat(world: World, x: number, y: number, facing = -1, seed?: number): Enemy {
  const enemy = new Enemy('bat', world, x, y, facing, seed);

  const hover = new Hover(enemy);
  const recoil = new Recoil(enemy);
  enemy.add(hover);
  enemy.add(new Pursuit(enemy));
  enemy.add(recoil);
  enemy.add(new Death(enemy));

  // BeePatrol.ability_who_updates_patrol_area = BatJump: the bat re-centres its
  // wandering wherever the recoil left it, so a bat that has been chasing the
  // player does not spring back to where it originally spawned.
  enemy.events.on('ability_end', (name: string) => {
    if (name === recoil.name) hover.reanchor();
  });

  enemy.play_animation('idle');
  enemy.ai.configure({
    on_idle: ['Hover'],
    on_see_player: ['Pursuit'],
    on_touch_player: ['Recoil'],
  });
  return enemy;
}

const FACTORIES: Record<EnemyKind, typeof makeMetool> = {
  metool: makeMetool,
  bat: makeBat,
};

/** Build an enemy by kind — used by the level loader. */
export function spawnEnemy(
  kind: EnemyKind,
  world: World,
  x: number,
  y: number,
  facing = -1,
  seed?: number,
): Enemy {
  return FACTORIES[kind](world, x, y, facing, seed);
}
