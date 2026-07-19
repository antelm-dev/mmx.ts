import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { Input, Action } from "../src/core/Input.js";
import { DT } from "../src/core/constants.js";
import { Player } from "../src/engine/Player.js";
import { World } from "../src/engine/World.js";
import type { AnimData } from "../src/engine/Animation.js";

/**
 * The animation state the abilities drive (AbilityUser's animatedSprite): clip
 * names come from Player.tscn / Idle.tscn / Fall.tscn, and the handoffs
 * (walk_start -> walk, recover -> idle, the shot layer swap) are the ones the
 * Godot scripts wire through the `animation_finished` signal.
 */

const animData = JSON.parse(
  readFileSync(new URL("../../../resources/sprites/player/x_anims.json", import.meta.url), "utf8"),
) as AnimData;

// A flat 30x12 room with a solid floor and walls on both sides.
function flatRoom(): World {
  const rows: string[] = [];
  for (let y = 0; y < 11; y++) rows.push("#" + ".".repeat(28) + "#");
  rows.push("#".repeat(30));
  return World.fromRows(rows);
}

function makePlayer() {
  const input = new Input();
  const player = new Player(flatRoom(), 5 * 16, 10 * 16, input);
  player.loadAnimations(animData);
  for (let i = 0; i < 5; i++) player.tick(DT);
  return { input, player };
}

const run = (player: Player, frames: number) => {
  for (let i = 0; i < frames; i++) player.tick(DT);
};
const hold = (input: Input, a: Action, on: boolean) => input.setDown(a, on);

test("every clip an ability asks for exists in the exported spritesheet", () => {
  const { input, player } = makePlayer();
  const clips = new Set(Object.keys(animData.animations));
  const seen = new Set<string>();
  player.events.on("animation_finished", () => seen.add(player.get_animation()));

  // drive a bit of everything: walk, shoot, jump, fall, dash, wall-slide, wall-kick
  const script: [Action[], number][] = [
    [["move_right"], 30],
    [["move_right", "fire"], 5],
    [["move_right"], 20],
    [["jump"], 25],
    [[], 30],
    [["dash", "move_right"], 40],
    [["move_right"], 60],
    [["jump", "move_right"], 20],
    [["move_right"], 30],
  ];
  for (const [actions, frames] of script) {
    for (const a of ["move_left", "move_right", "jump", "dash", "fire"] as Action[]) {
      hold(input, a, actions.includes(a));
    }
    for (let i = 0; i < frames; i++) {
      player.tick(DT);
      seen.add(player.get_animation());
    }
  }

  const unknown = [...seen].filter((name) => !clips.has(name));
  assert.deepEqual(unknown, [], `abilities asked for clips x.res does not have: ${unknown}`);
});

test("idle plays the recover pose, then settles into the looping idle clip", () => {
  const { player } = makePlayer();
  assert.ok(player.is_executing("Idle"), player.stateString());
  assert.equal(player.get_animation(), "recover"); // Idle.tscn animation
  run(player, 20);
  assert.equal(player.get_animation(), "idle"); // IdleWeak after animation_finished
});

test("walking out of idle plays walk_start, then loops walk", () => {
  const { input, player } = makePlayer();
  run(player, 20); // settle into idle
  hold(input, "move_right", true);
  player.tick(DT);
  assert.equal(player.get_animation(), "walk_start");
  run(player, 10);
  assert.equal(player.get_animation(), "walk");
});

test("walking out of a dash skips the walk_start lead-in", () => {
  const { input, player } = makePlayer();
  hold(input, "move_right", true);
  hold(input, "dash", true);
  run(player, 10);
  assert.equal(player.get_animation(), "dash");
  hold(input, "dash", false);
  run(player, 45); // dash runs out; walking continues
  assert.ok(player.is_executing("Walk"), player.stateString());
  assert.equal(player.get_animation(), "walk");
});

test("the jump hands off to fall at the apex without restarting the clip", () => {
  const { input, player } = makePlayer();
  hold(input, "jump", true);
  player.tick(DT);
  assert.equal(player.get_animation(), "jump");
  hold(input, "jump", false);

  // Jump ends at the apex (change_animation_if_falling) and Fall takes over.
  let framesIntoFall = -1;
  for (let i = 0; i < 60 && framesIntoFall < 0; i++) {
    player.tick(DT);
    if (player.is_executing("Fall")) framesIntoFall = i;
  }
  assert.ok(framesIntoFall >= 0, "never entered Fall");
  assert.equal(player.get_animation(), "fall");

  // Re-entering Fall must not rewind an already-playing fall clip.
  run(player, 4);
  const frame = player.anim.frame;
  player.get_ability("Fall")!.ExecuteOnce();
  assert.equal(player.anim.frame, frame, "fall clip restarted on re-entry");
});

test("wall-sliding plays the slide clip", () => {
  const rows: string[] = [];
  for (let y = 0; y < 14; y++) rows.push("#" + ".".repeat(28) + "#");
  rows.push("#".repeat(30));
  const input = new Input();
  const player = new Player(World.fromRows(rows), 28 * 16, 3 * 16, input); // airborne by the wall
  player.loadAnimations(animData);

  hold(input, "move_right", true); // press into the wall while falling
  for (let i = 0; i < 120 && !player.is_executing("WallSlide"); i++) player.tick(DT);
  assert.ok(player.is_executing("WallSlide"), player.stateString());
  assert.equal(player.get_animation(), "slide"); // the clip is `slide`, not `wallslide`

  hold(input, "jump", true);
  run(player, 2);
  assert.ok(player.is_executing("WallJump"), player.stateString());
  assert.equal(player.get_animation(), "walljump");
});

test("shooting swaps the arm-pointing layer instead of changing the clip", () => {
  const { input, player } = makePlayer();
  hold(input, "move_right", true);
  run(player, 30);
  assert.equal(player.get_animation(), "walk");
  assert.equal(player.get_animation_layer(), "normal");

  hold(input, "fire", true);
  player.tick(DT);
  hold(input, "fire", false);
  assert.equal(player.get_animation_layer(), "pointing_cannon");
  assert.equal(player.get_animation(), "walk", "the walk cycle must keep playing");

  // the arm goes back down once the arm-point window expires
  run(player, 40);
  assert.equal(player.get_animation_layer(), "normal");
});

test("the arm-pointing atlas has a region for every frame of every clip", () => {
  for (const [name, clip] of Object.entries(animData.animations)) {
    for (const [i, frame] of clip.frames.entries()) {
      assert.ok(frame.armRegion, `${name}[${i}] has no armRegion — rerun scripts/build-anims.mjs`);
    }
  }
});
