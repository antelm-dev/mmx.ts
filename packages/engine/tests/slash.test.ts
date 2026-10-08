import { test } from "node:test";
import assert from "node:assert/strict";

import { Input, type Action } from "../src/core/Input.js";
import { DT, ENEMY_STATS } from "../src/core/constants.js";
import { Actor } from "../src/game/Actor.js";
import { Player } from "../src/game/Player.js";
import { Recorder } from "../src/game/Recorder.js";
import { Stage } from "../src/game/Stage.js";
import { World } from "../src/game/World.js";
import { makeMetool } from "../src/game/enemies/index.js";
import { stage2 } from "./fixtures/levels.js";
import { GAME_DATA } from "../src/data/gameData.js";
import { compileGameData } from "../src/data/compileGameData.js";
import { buildCompileRegistries } from "../src/behaviors/index.js";

const FLOOR_Y = 11 * 16;

// A 30x12 room: solid floor on the bottom row, walls on both sides.
function room(): World {
  const rows: string[] = [];
  for (let y = 0; y < 11; y++) rows.push("#" + ".".repeat(28) + "#");
  rows.push("#".repeat(30));
  return World.fromRows(rows);
}

function zero(x = 120) {
  const input = new Input();
  const player = new Player(room(), x, FLOOR_Y - 15, input, 1, "player.zero");
  for (let i = 0; i < 5; i++) player.tick(DT);
  return { input, player };
}

function tap(input: Input, player: Player, action: Action = "fire"): void {
  input.setDown(action, true);
  player.tick(DT);
  input.setDown(action, false);
}

function ticks(player: Player, n: number): void {
  for (let i = 0; i < n; i++) player.tick(DT);
}

test("presses inside the chain window run the combo to slash_3", () => {
  const { input, player } = zero();
  tap(input, player);
  assert.equal(player.get_animation(), "slash_1");
  ticks(player, 5);
  tap(input, player);
  assert.equal(player.get_animation(), "slash_2");
  ticks(player, 10);
  tap(input, player);
  assert.equal(player.get_animation(), "slash_3");
  ticks(player, 5);
  tap(input, player);
  assert.equal(player.get_animation(), "slash_3", "slash_3 does not chain or restart");
});

test("every swing, chained or not, announces itself once for the swing sound", () => {
  const { input, player } = zero();
  const swings: string[] = [];
  player.events.on("slash", (step: string) => swings.push(step));
  tap(input, player);
  ticks(player, 5);
  tap(input, player);
  ticks(player, 30);
  assert.deepEqual(swings, ["slash1", "slash2"]);
});

test("a press after the swing has ended restarts at slash_1", () => {
  const { input, player } = zero();
  tap(input, player);
  ticks(player, 20); // slash_1 lasts 18 frames
  assert.equal(player.is_executing("Slash"), false);
  tap(input, player);
  assert.equal(player.get_animation(), "slash_1");
});

test("a ground swing holds the player in place", () => {
  const { input, player } = zero();
  const x = player.pos.x;
  tap(input, player);
  input.setDown("move_left", true);
  ticks(player, 10);
  assert.equal(player.pos.x, x);
  assert.equal(player.get_facing_direction(), 1, "and does not turn");
  ticks(player, 10);
  assert.ok(player.pos.x < x, "walks again once the swing ends");
});

test("a press while airborne gives jump_slash", () => {
  const { input, player } = zero();
  input.setDown("jump", true);
  ticks(player, 4);
  tap(input, player);
  assert.equal(player.get_animation(), "jump_slash");
  ticks(player, 4);
  assert.equal(player.get_animation(), "jump_slash", "rising into Fall keeps the swing's clip");
});

test("a press during a wall slide gives wall_slash with the box away from the wall", () => {
  const { input, player } = zero(29 * 16 - 20);
  input.setDown("move_right", true);
  input.setDown("jump", true);
  for (let i = 0; i < 60 && !player.is_executing("WallSlide"); i++) player.tick(DT);
  input.setDown("jump", false);
  assert.ok(player.is_executing("WallSlide"), player.stateString());

  tap(input, player);
  assert.equal(player.get_animation(), "wall_slash");
  player.tick(DT); // activeFrom = 1
  const box = player.meleeBounds;
  assert.ok(box, "the blade is live");
  assert.ok(box.right < player.pos.x, "the blade swings away from the wall on the right");
  assert.equal(player.get_facing_direction(), -1, "the facing itself is untouched");
  assert.equal(player.get_sprite_facing(), 1, "the clip is drawn toward the box, not the wall");

  // The kick off the wall still goes left, away from it, and ends the flip.
  const wallX = player.pos.x;
  input.setDown("jump", true);
  ticks(player, 5);
  assert.ok(player.is_executing("WallJump"), player.stateString());
  assert.ok(player.pos.x < wallX, "the kick moved away from the wall");
  assert.equal(
    player.get_sprite_facing(),
    player.get_facing_direction(),
    "the flip ends with the swing",
  );
});

test("a swing damages a Metool once", () => {
  const { input, player } = zero(10 * 16);
  const stage = new Stage(player.world, player);
  const metool = stage.add(
    makeMetool(player.world, player.pos.x + 20, FLOOR_Y - ENEMY_STATS.metool.hh, -1, 1234),
  );
  metool.get_ability("Hide")!.active = false; // no hiding: the shield stays down so the blade can land
  metool.max_health = metool.current_health = 10;

  input.setDown("fire", true);
  stage.tick(DT);
  input.setDown("fire", false);
  for (let i = 0; i < 20; i++) {
    metool.pos.x = player.pos.x + 20; // pinned inside the blade for every active frame
    stage.tick(DT);
  }
  assert.equal(metool.current_health, 10 - 2);
});

test("getting hit cancels the swing and its blade", () => {
  const { input, player } = zero();
  tap(input, player);
  ticks(player, 1);
  assert.ok(player.melee, "precondition: the blade is live");
  player.damage(1, new Actor(player.world, player.pos.x + 5, player.pos.y));
  assert.equal(player.melee, null);
  player.tick(DT);
  assert.equal(player.is_executing("Slash"), false);
});

test("a swing does not survive a restart, rewind or level load", () => {
  const recorder = new Recorder({ level: stage2, seed: 1, loadoutId: "player.zero" });
  const swing = { box: { hw: 8, hh: 8 }, damage: 1, activeFrames: 60 };
  for (const reset of [
    () => recorder.restart(),
    () => recorder.rewindTo(0),
    () => recorder.restartLevel(),
    () => recorder.loadLevel(stage2),
  ]) {
    recorder.scene.player.startMelee(swing);
    assert.equal(reset().player.melee, null);
  }
});

/** Combo, run, jump slash and dash slash, one line per tick. */
function replay(): string {
  const input = new Input();
  const player = new Player(room(), 80, FLOOR_Y - 15, input, 7, "player.zero");
  const lines: string[] = [];
  for (let f = 0; f < 200; f++) {
    input.setDown("fire", [10, 16, 30, 90, 150].includes(f));
    input.setDown("move_right", f >= 60);
    input.setDown("jump", f >= 85 && f < 95);
    input.setDown("dash", f >= 140 && f < 160);
    player.tick(DT);
    const box = player.meleeBounds;
    lines.push(
      `${player.pos.x},${player.pos.y},${player.get_animation()},${player.stateString()},${box ? box.left : "-"}`,
    );
  }
  return lines.join("\n");
}

test("a scripted slash replay is deterministic", () => {
  const a = replay();
  assert.equal(a, replay());
  for (const clip of ["slash_3", "jump_slash", "dash_slash"]) {
    assert.ok(a.includes(`,${clip},`), `script should reach ${clip}`);
  }
});

test("a slash step whose blade outlasts the swing fails compilation", () => {
  const slash = GAME_DATA.abilities["zero.slash"];
  const config = { ...slash.config, slash1: { ...(slash.config!.slash1 as object), activeTo: 18 } };
  const result = compileGameData(
    { ...GAME_DATA, abilities: { ...GAME_DATA.abilities, "zero.slash": { ...slash, config } } },
    buildCompileRegistries(),
  );
  assert.ok(
    result.diagnostics.some((d) => d.fieldPath?.includes("slash1")),
    JSON.stringify(result.diagnostics),
  );
});
