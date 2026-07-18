import { Input, Action } from "../core/Input.js";
import { DT } from "../core/constants.js";
import { Player } from "../engine/Player.js";
import { Stage } from "../engine/Stage.js";
import { spawnEnemy } from "../engine/enemies/index.js";
import { makeWorld, SPAWN, ENEMY_SPAWNS } from "../engine/level.js";

/**
 * Deterministic headless simulation. Drives the ported player through a scripted
 * input timeline and prints the resulting state trace — proving the whole gameplay
 * runs in pure Node with no rendering. Run with:  npm run sim
 *
 * The enemies run here too, without any clip data: with no frames loaded every
 * clip reports itself finished on the next tick, so the animation-gated beats of
 * their state machines pass through in one frame instead of several. They still
 * patrol, hide, chase and die — which is the point, since it means none of that
 * logic secretly depends on the renderer's assets.
 */

const input = new Input();
const world = makeWorld();
const player = new Player(world, SPAWN.x, SPAWN.y, input);
const stage = new Stage(world, player);
for (const [i, spawn] of ENEMY_SPAWNS.entries()) {
  stage.add(spawnEnemy(spawn.kind, world, spawn.x, spawn.y, spawn.facing, 0x51ed + i));
}

// A scripted timeline: at frame N, set an action down/up.
type Cue = { frame: number; action: Action; down: boolean };
const script: Cue[] = [
  { frame: 5, action: "move_right", down: true }, // walk right
  { frame: 40, action: "jump", down: true }, // jump while running
  { frame: 43, action: "jump", down: false }, // short hop (release early)
  { frame: 70, action: "jump", down: true }, // full jump (hold)
  { frame: 95, action: "jump", down: false },
  { frame: 110, action: "dash", down: true }, // dash right
  { frame: 140, action: "dash", down: false },
  { frame: 150, action: "dash", down: true }, // dash...
  { frame: 152, action: "jump", down: true }, // ...jump = DashJump
  { frame: 180, action: "dash", down: false },
  { frame: 180, action: "jump", down: false },
  { frame: 200, action: "fire", down: true }, // charge...
  { frame: 260, action: "fire", down: false }, // ...release charged shot
  { frame: 300, action: "move_right", down: false },
  // Mash fire: six taps, four frames apart. The buster's three-shots-alive cap
  // (Weapon.gd:can_shoot) should hold the volley to three in flight, which is
  // what gives buster fire its rhythm instead of a continuous stream.
  ...Array.from({ length: 6 }, (_, i) => [
    { frame: 330 + i * 4, action: "fire" as Action, down: true },
    { frame: 331 + i * 4, action: "fire" as Action, down: false },
  ]).flat(),
];

function label(n: number): string {
  return n.toFixed(1).padStart(7);
}

console.log("Mega Man X — TypeScript gameplay core (headless sim)\n");
console.log("frame |    posX |    posY |   velX |   velY | floor | hp | state");
console.log("------+---------+---------+--------+--------+-------+----+------------------");

/**
 * Live shots by type, plus any that are spent and only playing their hit
 * particle — the two phases are easy to confuse from a bare count.
 */
function shotsColumn(): string {
  if (player.projectiles.length === 0) return "";
  const live = player.projectiles.filter((p) => p.isLive);
  const spent = player.projectiles.length - live.length;
  const byKind = new Map<string, number>();
  for (const p of live) byKind.set(p.kind, (byKind.get(p.kind) ?? 0) + 1);
  const parts = [...byKind].map(([kind, n]) => `${n} ${kind}`);
  if (spent) parts.push(`${spent} impacting`);
  return `  (${parts.join(", ")})`;
}

const TOTAL = 380;
let cueIdx = 0;
for (let f = 0; f <= TOTAL; f++) {
  while (cueIdx < script.length && script[cueIdx].frame === f) {
    const c = script[cueIdx++];
    input.setDown(c.action, c.down);
  }

  stage.tick(DT);

  if (f % 5 === 0) {
    console.log(
      `${String(f).padStart(5)} | ${label(player.pos.x)} | ${label(player.pos.y)} | ` +
        `${label(player.velocity.x)} | ${label(player.velocity.y)} | ` +
        `${(player.is_on_floor() ? "yes" : "no").padStart(5)} | ` +
        `${String(player.current_health).padStart(2)} | ${player.stateString()}` +
        shotsColumn(),
    );
  }
}

console.log("\nFinal position:", player.pos.x.toFixed(1), player.pos.y.toFixed(1));
console.log(
  `Enemies: ${stage.enemies.length} of ${ENEMY_SPAWNS.length} still standing —`,
  stage.enemies.map((e) => `${e.kind} ${e.current_health}hp`).join(", ") || "none",
);
console.log("Simulation complete — every core movement state was exercised.");
