import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { Input } from "../src/core/Input.js";
import {
  DT,
  PLAYER_DAMAGE_DURATION,
  PLAYER_DAMAGE_INVULNERABILITY,
  PLAYER_DEATH_RESTART_DELAY,
} from "../src/core/constants.js";
import { Actor } from "../src/engine/Actor.js";
import type { AnimData } from "../src/engine/Animation.js";
import { Player } from "../src/engine/Player.js";
import { Stage } from "../src/engine/Stage.js";
import { World } from "../src/engine/World.js";
import { makeMetool } from "../src/engine/enemies/index.js";

const animData = JSON.parse(
  readFileSync(new URL("../../../resources/sprites/player/x_anims.json", import.meta.url), "utf8"),
) as AnimData;

function room(): World {
  const rows = Array.from({ length: 11 }, () => "#" + ".".repeat(38) + "#");
  rows.push("#".repeat(40));
  return World.fromRows(rows);
}

function makePlayer() {
  const world = room();
  const input = new Input();
  const player = new Player(world, 10 * 16, 10 * 16, input);
  player.loadAnimations(animData);
  for (let i = 0; i < 5; i++) player.tick(DT);
  return { world, input, player };
}

function run(player: Player, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) player.tick(DT);
}

/** Two hits, spaced past invulnerability, land the player on exactly zero health. */
function killPlayer(player: Player, enemy: Actor): void {
  player.damage(100, enemy); // death_protection clamps this one to 1hp
  run(player, PLAYER_DAMAGE_DURATION + PLAYER_DAMAGE_INVULNERABILITY + 0.1);
  player.damage(100, enemy);
}

test("zero health starts Death, freezes the player, and hides the sprite", () => {
  const { world, player } = makePlayer();
  const enemy = new Actor(world, player.pos.x - 5, player.pos.y);

  killPlayer(player, enemy);

  assert.equal(player.current_health, 0);
  assert.deepEqual(
    player.executing_moves.map((m) => m.name),
    ["Death"],
  );
  assert.equal(player.sprite_visible, false);
  assert.equal(player.listening_to_inputs, false);

  const before = { x: player.pos.x, y: player.pos.y };
  run(player, 1);
  assert.equal(player.pos.x, before.x, "Death holds position, no drift");
  assert.equal(player.pos.y, before.y);
});

test("a second lethal hit is not needed twice — zero health only ever hands off once", () => {
  const { world, player } = makePlayer();
  const enemy = new Actor(world, player.pos.x - 5, player.pos.y);
  let deaths = 0;
  player.events.on("zero_health", () => deaths++);

  killPlayer(player, enemy);
  run(player, 0.5);
  // Damage no longer applies once Death owns the state (has_health() is false).
  player.damage(5, enemy);

  assert.equal(deaths, 1);
  assert.equal(player.current_health, 0);
});

test("Death ends after the restart delay and hands off with a death event", () => {
  const { world, player } = makePlayer();
  const enemy = new Actor(world, player.pos.x - 5, player.pos.y);
  let deaths = 0;
  player.events.on("death", () => deaths++);

  killPlayer(player, enemy);
  assert.ok(player.is_executing("Death"));

  run(player, PLAYER_DEATH_RESTART_DELAY - 0.1);
  assert.ok(player.is_executing("Death"), "not yet — still short of the delay");
  assert.equal(deaths, 0);

  run(player, 0.2);
  assert.equal(player.is_executing("Death"), false);
  assert.equal(deaths, 1);
});

test("a dead player cannot be hurt further by contact", () => {
  const world = room();
  const input = new Input();
  const player = new Player(world, 20 * 16, 10 * 16 - 14, input);
  player.loadAnimations(animData);
  const stage = new Stage(world, player);
  const enemy = new Actor(world, player.pos.x - 5, player.pos.y);

  killPlayer(player, enemy);
  assert.equal(player.current_health, 0);

  const metool = stage.add(makeMetool(world, player.pos.x, player.pos.y, 1, 7));
  stage.tick(DT);

  assert.equal(player.current_health, 0, "still 0, not negative");
  assert.equal(metool.ai.active, true, "the enemy never reacted to touching a corpse");
});
