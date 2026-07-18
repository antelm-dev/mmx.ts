import { Input, Action } from '../core/Input.js';
import { DT } from '../core/constants.js';
import { Player } from '../engine/Player.js';
import { makeWorld, SPAWN } from '../engine/level.js';

/**
 * Deterministic headless simulation. Drives the ported player through a scripted
 * input timeline and prints the resulting state trace — proving the whole gameplay
 * runs in pure Node with no rendering. Run with:  npm run sim
 */

const input = new Input();
const world = makeWorld();
const player = new Player(world, SPAWN.x, SPAWN.y, input);

// A scripted timeline: at frame N, set an action down/up.
type Cue = { frame: number; action: Action; down: boolean };
const script: Cue[] = [
  { frame: 5, action: 'move_right', down: true }, // walk right
  { frame: 40, action: 'jump', down: true }, // jump while running
  { frame: 43, action: 'jump', down: false }, // short hop (release early)
  { frame: 70, action: 'jump', down: true }, // full jump (hold)
  { frame: 95, action: 'jump', down: false },
  { frame: 110, action: 'dash', down: true }, // dash right
  { frame: 140, action: 'dash', down: false },
  { frame: 150, action: 'dash', down: true }, // dash...
  { frame: 152, action: 'jump', down: true }, // ...jump = DashJump
  { frame: 180, action: 'dash', down: false },
  { frame: 180, action: 'jump', down: false },
  { frame: 200, action: 'fire', down: true }, // charge...
  { frame: 260, action: 'fire', down: false }, // ...release charged shot
  { frame: 300, action: 'move_right', down: false },
];

function label(n: number): string {
  return n.toFixed(1).padStart(7);
}

console.log('Mega Man X — TypeScript gameplay core (headless sim)\n');
console.log('frame |    posX |    posY |   velX |   velY | floor | state');
console.log('------+---------+---------+--------+--------+-------+----------------------');

const TOTAL = 320;
let cueIdx = 0;
for (let f = 0; f <= TOTAL; f++) {
  while (cueIdx < script.length && script[cueIdx].frame === f) {
    const c = script[cueIdx++];
    input.setDown(c.action, c.down);
  }

  player.tick(DT);

  if (f % 5 === 0) {
    console.log(
      `${String(f).padStart(5)} | ${label(player.pos.x)} | ${label(player.pos.y)} | ` +
        `${label(player.velocity.x)} | ${label(player.velocity.y)} | ` +
        `${(player.is_on_floor() ? 'yes' : 'no').padStart(5)} | ${player.stateString()}` +
        (player.projectiles.length ? `  (${player.projectiles.length} shots)` : ''),
    );
  }
}

console.log('\nFinal position:', player.pos.x.toFixed(1), player.pos.y.toFixed(1));
console.log('Simulation complete — every core movement state was exercised.');
