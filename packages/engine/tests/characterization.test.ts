import { test } from "node:test";
import assert from "node:assert/strict";

import { Tile } from "../src/game/World.js";
import type { LevelData, LevelEntity } from "../src/game/LevelData.js";
import { Scene } from "../src/game/Scene.js";
import { levelCatalog } from "./fixtures/levels.js";
import { makeBat, makeMetool } from "../src/game/enemies/index.js";
import { World } from "../src/game/World.js";
import {
  BUSTER_SHOTS,
  DARK_ARROW_SHOT,
  DT,
  ENEMY_STATS,
  LIFE_CAPSULE_STATS,
  MAX_HEALTH,
  SUB_WEAPON_CONFIG,
  WEAPON_CAPSULE_STATS,
  WEAPON_ORDER,
} from "../src/core/constants.js";

/**
 * Characterization tests — a behavioural snapshot of the engine *as it is today*,
 * taken before the data-driven refactor. These pin composition (which abilities,
 * in which order), the tuned statistics that are about to move into game data,
 * and end-to-end simulation digests for representative input sequences.
 *
 * The digests below were captured from the current build. They are a regression
 * fence, not a spec: if the refactor is behaviour-preserving they stay green
 * untouched. Do NOT rebless them to make a refactor pass unless an intentional,
 * approved behaviour change explains the diff.
 */

// --- A flat, geometry-free room so a run characterizes gameplay, not terrain ---

const COLS = 60;
const ROWS = 16;
const GRID = 16;

function flatLevel(entities: LevelEntity[] = []): LevelData {
  const tiles = new Array<Tile>(COLS * ROWS).fill(Tile.Empty);
  for (let c = 0; c < COLS; c++) tiles[(ROWS - 1) * COLS + c] = Tile.Solid;
  const spawn: LevelEntity = {
    id: "Spawn",
    iid: "spawn-1",
    x: 30 * GRID,
    y: (ROWS - 2) * GRID,
    w: 16,
    h: 16,
    fields: {},
  };
  return {
    identifier: "characterization-flat",
    gridSize: GRID,
    cols: COLS,
    rows: ROWS,
    tiles,
    entities: [spawn, ...entities],
  };
}

const M = {
  left: 1 << 0,
  right: 1 << 1,
  up: 1 << 2,
  down: 1 << 3,
  jump: 1 << 4,
  dash: 1 << 5,
  fire: 1 << 6,
  wleft: 1 << 7,
  wright: 1 << 8,
} as const;

const repeat = (mask: number, n: number): number[] => new Array(n).fill(mask);

function digestOf(frames: number[]): string {
  const scene = Scene.create({ level: flatLevel() });
  for (const m of frames) scene.step(m);
  return scene.digest();
}

// The beam-down Intro consumes the opening ~1s and ignores input; warm up past
// it so each action characterizes gameplay rather than the entrance.
const WARM = repeat(0, 120);
const taps: number[] = [];
for (let i = 0; i < 8; i++) taps.push(M.fire, 0, 0, 0, 0, 0);

const DIGEST_SEQUENCES: Record<string, { frames: number[]; digest: string }> = {
  idle: { frames: [...WARM, ...repeat(0, 60)], digest: "f07e9932" },
  walkRight: { frames: [...WARM, ...repeat(M.right, 90), ...repeat(0, 30)], digest: "b103e625" },
  jumpInPlace: { frames: [...WARM, ...repeat(M.jump, 30), ...repeat(0, 60)], digest: "03603672" },
  dashLeft: {
    frames: [...WARM, ...repeat(M.dash | M.left, 20), ...repeat(0, 40)],
    digest: "7c505a81",
  },
  fireTaps: { frames: [...WARM, ...taps, ...repeat(0, 40)], digest: "eb5a8c92" },
  weaponSwitch: {
    frames: [
      ...WARM,
      M.wright,
      ...repeat(0, 5),
      M.fire,
      ...repeat(0, 30),
      M.wleft,
      ...repeat(0, 20),
    ],
    digest: "3a238213",
  },
};

// ---------------------------------------------------------------------------
// Player composition
// ---------------------------------------------------------------------------

test("player ability composition and order", () => {
  const scene = Scene.create({ level: flatLevel() });
  assert.deepEqual(
    scene.player.moveset.map((m) => m.name),
    [
      "Idle",
      "Walk",
      "Fall",
      "WallSlide",
      "Dash",
      "AirDash",
      "Jump",
      "DashJump",
      "WallJump",
      "DashWallJump",
      "Intro",
      "Damage",
      "Death",
      "Shot",
      "Charge",
    ],
  );
});

test("player starts on the buster with full health", () => {
  const scene = Scene.create({ level: flatLevel() });
  assert.equal(scene.player.activeWeapon, "buster");
  assert.equal(scene.player.max_health, MAX_HEALTH);
  assert.equal(scene.player.current_health, MAX_HEALTH);
});

test("weapon order is buster then dark_arrow", () => {
  assert.deepEqual([...WEAPON_ORDER], ["buster", "dark_arrow"]);
});

// ---------------------------------------------------------------------------
// Enemy composition, reactions, statistics, hitboxes
// ---------------------------------------------------------------------------

function room(): World {
  const rows: string[] = [];
  for (let y = 0; y < 10; y++) rows.push("#" + ".".repeat(78) + "#");
  rows.push("#".repeat(80));
  return World.fromRows(rows);
}

test("Metool composition, AI wiring and initial state", () => {
  const metool = makeMetool(room(), 300, 100, -1, 1234);
  assert.deepEqual(
    metool.abilities.map((a) => a.name),
    ["Patrol", "Hide", "Stun", "Death"],
  );
  assert.deepEqual(metool.ai.events, {
    on_idle: ["Patrol"],
    on_see_player: ["Hide"],
    on_guard_break: ["Stun"],
  });
  assert.equal(metool.get_animation(), "idle");
  assert.equal(metool.get_facing_direction(), -1);
  assert.equal(metool.kind, "metool");
});

test("Bat composition, AI wiring and initial state", () => {
  const bat = makeBat(room(), 300, 80, -1, 99);
  assert.deepEqual(
    bat.abilities.map((a) => a.name),
    ["Hover", "Pursuit", "Recoil", "Death"],
  );
  assert.deepEqual(bat.ai.events, {
    on_idle: ["Hover"],
    on_see_player: ["Pursuit"],
    on_touch_player: ["Recoil"],
  });
  assert.equal(bat.get_animation(), "idle");
  assert.equal(bat.kind, "bat");
});

test("enemy statistics and hitboxes", () => {
  assert.deepEqual(ENEMY_STATS.metool, {
    sheet: "metool",
    max_health: 2,
    touch_damage: 3,
    hw: 12,
    hh: 10,
    hurt_hw: 9,
    hurt_hh: 10,
    vision_hw: 158,
    vision_hh: 18,
    vision_oy: -6,
    flying: false,
  });
  assert.deepEqual(ENEMY_STATS.bat, {
    sheet: "bat",
    max_health: 1,
    touch_damage: 1,
    hw: 13.5,
    hh: 15.5,
    hurt_hw: 10,
    hurt_hh: 10,
    vision_hw: 102,
    vision_hh: 86.5,
    vision_oy: 1.5,
    flying: true,
  });
});

test("enemy body/hurtbox/vision derive from stats", () => {
  const metool = makeMetool(room(), 300, 100, -1, 1234);
  assert.equal(metool.hw, ENEMY_STATS.metool.hw);
  assert.equal(metool.hh, ENEMY_STATS.metool.hh);
  assert.equal(metool.max_health, ENEMY_STATS.metool.max_health);
  const hb = metool.hurtbox;
  assert.equal(hb.left, metool.pos.x - ENEMY_STATS.metool.hurt_hw);
  assert.equal(hb.right, metool.pos.x + ENEMY_STATS.metool.hurt_hw);
});

// ---------------------------------------------------------------------------
// Buster charge levels & Dark Arrow
// ---------------------------------------------------------------------------

test("buster charge table: lemon / medium / charged", () => {
  assert.equal(BUSTER_SHOTS.length, 3);
  assert.deepEqual(
    BUSTER_SHOTS.map((s) => [s.kind, s.damage, s.speed]),
    [
      ["lemon", 1, 360],
      ["medium", 5, 360],
      ["charged", 10, 420],
    ],
  );
  // Charged shot hitbox and pull-back into the cannon.
  const charged = BUSTER_SHOTS[2];
  assert.equal(charged.halfW, 17);
  assert.equal(charged.halfH, 18);
  assert.equal(charged.spawnX, -10);
  assert.equal(charged.verticalRange, 0);
});

test("Dark Arrow statistics and ammo config", () => {
  assert.equal(DARK_ARROW_SHOT.kind, "dark_arrow");
  assert.equal(DARK_ARROW_SHOT.damage, 3);
  assert.equal(DARK_ARROW_SHOT.speed, 420);
  assert.equal(DARK_ARROW_SHOT.frameCount, 1);
  assert.deepEqual(SUB_WEAPON_CONFIG.dark_arrow, { ammoCost: 1, maxShotsAlive: 3 });
});

// ---------------------------------------------------------------------------
// Pickup values
// ---------------------------------------------------------------------------

test("pickup values", () => {
  assert.equal(LIFE_CAPSULE_STATS.small.heal, 2);
  assert.equal(LIFE_CAPSULE_STATS.large.heal, 8);
  assert.equal(WEAPON_CAPSULE_STATS.small.ammo, 2);
  assert.equal(WEAPON_CAPSULE_STATS.large.ammo, 8);
});

// ---------------------------------------------------------------------------
// Moving-platform behaviour
// ---------------------------------------------------------------------------

test("a moving platform oscillates within its authored travel range", () => {
  const level = flatLevel([
    {
      id: "MovingPlatform",
      iid: "plat-1",
      x: 10 * GRID,
      y: 8 * GRID,
      w: 48,
      h: 8,
      fields: { Travel: 96, Speed: 48 },
    },
  ]);
  const scene = Scene.create({ level });
  const platform = scene.stage.platforms[0];
  const startX = platform.x;

  let minX = Infinity;
  let maxX = -Infinity;
  const directions = new Set<number>();
  for (let i = 0; i < 400; i++) {
    scene.step(0);
    minX = Math.min(minX, platform.x);
    maxX = Math.max(maxX, platform.x);
    directions.add(platform.direction);
  }

  assert.ok(maxX - minX > 80 && maxX - minX <= 96 + 1, `travel span ${(maxX - minX).toFixed(1)}`);
  assert.ok(minX >= startX - 1, "never travels behind its origin");
  assert.deepEqual([...directions].sort(), [-1, 1], "reverses at both ends");
});

// ---------------------------------------------------------------------------
// Level loading
// ---------------------------------------------------------------------------

test("every catalog level loads into a scene", () => {
  for (const level of levelCatalog) {
    const scene = Scene.create({ level });
    assert.ok(scene.player, `${level.identifier} produced a player`);
    // One tick must not throw on any shipped level.
    scene.step(0);
    assert.equal(scene.frame, 1);
  }
});

// ---------------------------------------------------------------------------
// Deterministic simulation digests
// ---------------------------------------------------------------------------

for (const [name, { frames, digest }] of Object.entries(DIGEST_SEQUENCES)) {
  test(`digest is stable: ${name}`, () => {
    assert.equal(digestOf(frames), digest);
  });
}

test("identical seed + inputs reproduce an identical digest", () => {
  const seq = DIGEST_SEQUENCES.weaponSwitch.frames;
  assert.equal(digestOf(seq), digestOf(seq));
});

test("DT is the fixed 60Hz step", () => {
  assert.equal(DT, 1 / 60);
});
