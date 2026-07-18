import { World } from './World.js';
import { TILE_SIZE } from '../core/constants.js';

/**
 * A small test chamber exercising every movement state:
 * flat ground (walk/dash), gaps (fall/dashfall), a tall wall (wallslide/walljump),
 * a ceiling (headbump), and platforms (jump/airdash).  '#' solid, ' ' or '.' empty.
 */
export const LEVEL: string[] = [
  '##########################################',
  '#........................................#',
  '#........................................#',
  '#..........................######........#',
  '#........................................#',
  '#...............#........................#',
  '#...............#.................####...#',
  '#...............#........................#',
  '#......####.....#........................#',
  '#...............#..............#.........#',
  '#...............#..............#.........#',
  '#.....................####.....#.........#',
  '#..............................#.........#',
  '#........###...................#.........#',
  '#..............................#....##...#',
  '#######.....................##############',
  '#........................................#',
  '#..###########...........................#',
  '#........................................#',
  '#........................................#',
  '##########################################',
];

export function makeWorld(): World {
  return new World(LEVEL);
}

/**
 * Spawn on the bottom floor (row 20 is solid) at a column with full headroom.
 * Column 15 is clear all the way to the ceiling; the original column 3 sits
 * directly under the row-17 platform (~2px of clearance), so a jump there would
 * instantly headbump and cancel its upward velocity.
 */
export const SPAWN = { x: 15 * TILE_SIZE, y: 19 * TILE_SIZE };
