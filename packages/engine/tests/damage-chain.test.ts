import { test } from "node:test";
import assert from "node:assert/strict";

import { Input } from "../src/core/Input.js";
import { DT } from "../src/core/constants.js";
import { Stage } from "../src/game/Stage.js";
import { World } from "../src/game/World.js";
import { Actor } from "../src/game/Actor.js";
import { computeDamage, type DamageEvent } from "../src/game/damage.js";
import { spawnEnemy } from "../src/game/enemies/index.js";
import { compileGameData, type CompiledGameData, type GameData } from "../src/data/index.js";
import { buildCompileRegistries } from "../src/behaviors/index.js";
import {
  ENEMY_STATS,
  MMX_GAME_DATA,
  compileStrict,
  createPlayer,
  makeMetool,
} from "./support/mmx.js";
import { PLAYER_KNOCKBACK_SPEED } from "./support/player.js";

const FLOOR_Y = 10 * 16;

function room(): World {
  const rows: string[] = [];
  for (let y = 0; y < 10; y++) rows.push("#" + ".".repeat(78) + "#");
  rows.push("#".repeat(80));
  return World.fromRows(rows);
}

/** MMX game data with `edit` applied, compiled strictly. */
function variant(edit: (data: GameData) => void): CompiledGameData {
  const data = structuredClone(MMX_GAME_DATA);
  edit(data);
  return compileStrict(data);
}

/** A stage with a bat 60px left of a grounded player facing it, both in `gameData`. */
function batStage(gameData: CompiledGameData, health = 10) {
  const world = room();
  const input = new Input();
  const player = createPlayer(world, 40 * 16, FLOOR_Y - 14, input, undefined, "player.x", gameData);
  const stage = new Stage(world, player, {}, gameData);
  const bat = stage.add(
    spawnEnemy(
      gameData.enemies.get("bat")!,
      world,
      player.pos.x - 60,
      player.pos.y,
      1,
      99,
      gameData,
    ),
  );
  bat.runtimeId = "bat-1";
  bat.max_health = bat.current_health = health;
  player.set_direction(-1);
  player.update_facing_direction();
  return { world, input, player, stage, bat };
}

/** Tick `frames` times, collecting every damage event. */
function run(stage: Stage, frames: number, events: DamageEvent[] = []): DamageEvent[] {
  for (let i = 0; i < frames; i++) {
    stage.tick(DT);
    events.push(...stage.damageEvents);
  }
  return events;
}

test("computeDamage: forced, multiplier, rounding, armor floor, immunity, zero base", () => {
  assert.deepEqual(computeDamage({ base: 3 }), { dealt: 3, result: "hit" });
  assert.deepEqual(computeDamage({ base: 3, multiplier: 200, armor: 1 }), {
    dealt: 5,
    result: "hit",
  });
  assert.deepEqual(computeDamage({ base: 3, multiplier: 50 }), { dealt: 2, result: "hit" }); // 1.5 rounds up
  assert.deepEqual(computeDamage({ base: 1, armor: 5 }), { dealt: 1, result: "hit" }, "floor 1");
  assert.deepEqual(computeDamage({ base: 9, forced: 2, multiplier: 300, armor: 1 }), {
    dealt: 1,
    result: "hit",
  });
  assert.deepEqual(computeDamage({ base: 9, multiplier: 0, forced: 4 }), {
    dealt: 0,
    result: "immune",
  });
  assert.deepEqual(computeDamage({ base: 0, armor: 1 }), { dealt: 0, result: "hit" });
});

test("a lemon logs one hit event, and the hit that empties health logs killed", () => {
  const { stage, player, bat } = batStage(
    variant(() => {}),
    2,
  );
  player.fireActiveWeapon(0);
  const events = run(stage, 30);
  // The lemon spawns 60px right of the bat's centre and flies left at 6px/frame,
  // the bat drifting toward it: the boxes meet on the third tick (frame 2).
  assert.deepEqual(events, [
    {
      frame: 2,
      attack: "lemon",
      weapon: "buster",
      charge: 0,
      source: { kind: "player", runtimeId: "player" },
      target: { kind: "bat", runtimeId: "bat-1" },
      base: 1,
      multiplier: 100,
      armor: 0,
      dealt: 1,
      result: "hit",
    },
  ]);
  assert.equal(bat.current_health, 1);

  player.fireActiveWeapon(0);
  const last = run(stage, 30);
  assert.equal(last.length, 1);
  assert.equal(last[0]!.result, "killed");
  assert.equal(stage.damageEvents.length, 0, "cleared at the start of every tick");
});

test("enemy i-frames: with invulnerabilityFrames 10, the second of two lemons 5 frames apart passes", () => {
  const twoLemons = (gameData: CompiledGameData): number => {
    const { stage, player, bat } = batStage(gameData);
    player.fireActiveWeapon(0);
    run(stage, 5);
    player.fireActiveWeapon(0);
    run(stage, 40);
    return bat.current_health;
  };
  // A thin hurtbox, so a lemon (6 px/frame) overlaps it for under 5 frames and
  // the second one has flown clear before the window ends.
  const thin = (d: GameData): void => {
    d.enemies.bat!.hurtbox = { hw: 1, hh: 10 };
  };
  assert.equal(twoLemons(variant(thin)), 8, "default 0 i-frames: both connect");
  const guarded = variant((d) => {
    thin(d);
    d.enemies.bat!.invulnerabilityFrames = 10;
  });
  assert.equal(guarded.enemies.get("bat")!.invulnerabilityFrames, 10);
  assert.equal(twoLemons(guarded), 9, "the second lemon lands inside the window");
  assert.equal("invulnerabilityFrames" in variant(() => {}).enemies.get("bat")!, false);
});

test("armor is a flat reduction with a floor of 1, on enemies and the player", () => {
  const armored = variant((d) => {
    d.actors["enemy.bat"]!.armor = 4;
    d.actors["player.x"]!.armor = 2;
  });
  const { stage, player, bat } = batStage(armored);
  player.fireActiveWeapon(2); // charged: 10
  const events = run(stage, 30);
  assert.equal(events[0]?.attack, "charged");
  assert.equal(events[0]?.armor, 4);
  assert.equal(bat.current_health, 10 - 6);

  // Touch damage 1 against armor 2 still costs 1.
  const full = player.current_health;
  bat.pos.x = player.pos.x;
  bat.pos.y = player.pos.y;
  const touch = run(stage, 1).filter((e) => e.attack === "touch");
  assert.equal(touch.length, 1);
  assert.equal(touch[0]!.dealt, 1);
  assert.equal(player.current_health, full - 1);
});

test("regen heals 1 HP every N frames while hurt but alive", () => {
  const regen = variant((d) => {
    d.actors["enemy.bat"]!.regenEveryFrames = 3;
    d.actors["player.x"]!.regenEveryFrames = 2;
  });
  const { stage, player, bat } = batStage(regen);
  player.pos.x = 70 * 16; // out of the bat's sight
  bat.current_health = 5;
  player.current_health = 10;
  run(stage, 2);
  assert.equal(bat.current_health, 5);
  assert.equal(player.current_health, 11);
  run(stage, 1);
  assert.equal(bat.current_health, 6);
  bat.current_health = bat.max_health;
  run(stage, 6);
  assert.equal(bat.current_health, bat.max_health, "never above max");
});

test("per-attack knockback overrides the Damage config for that hit only", () => {
  const world = room();
  const player = createPlayer(world, 20 * 16, FLOOR_Y - 14, new Input());
  for (let i = 0; i < 5; i++) player.tick(DT);
  const left = new Actor(world, player.pos.x - 5, player.pos.y);

  assert.equal(player.damage(1, left, { speed: 120, lift: 0, frames: 6 }), true);
  player.tick(DT);
  assert.equal(player.get_horizontal_speed(), 120);
  for (let i = 0; i < 6; i++) player.tick(DT);
  assert.equal(player.is_executing("Damage"), false, "6-frame tumble");

  player.invulnerability = 0;
  player.damage(1, left);
  player.tick(DT);
  assert.equal(player.get_horizontal_speed(), PLAYER_KNOCKBACK_SPEED, "next hit uses the config");
});

test("an enemy's touchKnockback reaches the player through the stage", () => {
  const pushy = variant((d) => {
    d.enemies.bat!.touchKnockback = { speed: 150 };
  });
  const { stage, player, bat } = batStage(pushy);
  bat.pos.x = player.pos.x - 4;
  bat.pos.y = player.pos.y;
  run(stage, 2);
  assert.ok(player.is_executing("Damage"));
  assert.equal(player.get_horizontal_speed(), 150);
});

test("stat fields must be whole numbers in range", () => {
  const data = structuredClone(MMX_GAME_DATA);
  data.actors["enemy.bat"]!.armor = 1.5;
  data.actors["enemy.bat"]!.regenEveryFrames = 0;
  data.enemies.bat!.invulnerabilityFrames = -1;
  data.enemies.bat!.touchKnockback = { frames: 0, speed: 2.5 };
  data.projectiles.lemon!.knockback = { lift: -1 };
  const result = compileGameData(data, buildCompileRegistries());
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.diagnostics.map((d) => [d.code, d.fieldPath]),
    [
      ["value.integer", "actors.enemy.bat.armor"],
      ["value.range", "actors.enemy.bat.regenEveryFrames"],
      ["value.range", "projectiles.lemon.knockback.lift"],
      ["value.integer", "enemies.bat.touchKnockback.speed"],
      ["value.range", "enemies.bat.touchKnockback.frames"],
      ["value.range", "enemies.bat.invulnerabilityFrames"],
    ],
  );
});

test("a raised guard logs shielded for a lemon and guard_break for a charged shot", () => {
  const world = room();
  const player = createPlayer(world, 24 * 16 + 60, FLOOR_Y - 14, new Input());
  const stage = new Stage(world, player);
  const metool = stage.add(makeMetool(world, 24 * 16, FLOOR_Y - ENEMY_STATS.metool.hh, -1, 1234));
  player.set_direction(-1);
  player.update_facing_direction();
  run(stage, 12);
  assert.equal(metool.has_shield(), true, "precondition: hidden");

  player.fireActiveWeapon(0);
  const lemon = run(stage, 20);
  player.fireActiveWeapon(2);
  const charged = run(stage, 20);
  assert.deepEqual(
    [...lemon, ...charged].map((e) => [e.attack, e.dealt, e.result]),
    [
      ["lemon", 0, "shielded"],
      ["charged", 0, "guard_break"],
    ],
  );
});
