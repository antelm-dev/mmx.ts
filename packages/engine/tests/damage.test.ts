import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { Input } from "../src/core/Input.js";
import {
  DT,
  PLAYER_DAMAGE_DURATION,
  PLAYER_DAMAGE_INVULNERABILITY,
  PLAYER_KNOCKBACK_JUMP_VELOCITY,
  PLAYER_KNOCKBACK_SPEED,
} from "../src/core/constants.js";
import { Actor } from "../src/engine/Actor.js";
import type { AnimData } from "../src/engine/Animation.js";
import { Player } from "../src/engine/Player.js";
import { World } from "../src/engine/World.js";

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

test("a hit immediately enters Damage, reduces health, and uses the damage clip", () => {
  const { world, player } = makePlayer();
  const enemy = new Actor(world, player.pos.x - 5, player.pos.y);
  const full = player.current_health;

  player.damage(3, enemy);

  assert.equal(player.current_health, full - 3);
  assert.ok(player.is_executing("Damage"), player.stateString());
  assert.equal(player.get_animation(), "damage");
  assert.equal(player.get_vertical_speed(), -PLAYER_KNOCKBACK_JUMP_VELOCITY);
  assert.equal(player.get_facing_direction(), -1, "faces the attacker");
  assert.equal(player.invulnerability, PLAYER_DAMAGE_INVULNERABILITY);
});

test("knockback travels away from the inflicter and ignores movement input", () => {
  const { world, input, player } = makePlayer();
  const enemy = new Actor(world, player.pos.x - 5, player.pos.y);
  input.setDown("move_left", true); // held toward the attacker
  const start = player.pos.x;

  player.damage(1, enemy);
  player.tick(DT);

  assert.equal(player.get_horizontal_speed(), PLAYER_KNOCKBACK_SPEED);
  assert.ok(player.pos.x > start, "was pushed right, away from an enemy on the left");
});

test("Damage interrupts dash and charge, and blocks actions until control returns", () => {
  const { world, input, player } = makePlayer();
  input.setDown("move_right", true);
  input.setDown("dash", true);
  input.setDown("fire", true);
  player.tick(DT);
  assert.ok(player.is_executing("Dash"));
  assert.ok(player.is_executing("Charge"));

  const enemy = new Actor(world, player.pos.x + 5, player.pos.y);
  player.damage(1, enemy);

  assert.deepEqual(
    player.executing_moves.map((move) => move.name),
    ["Damage"],
  );
  run(player, PLAYER_DAMAGE_DURATION / 2);
  assert.deepEqual(
    player.executing_moves.map((move) => move.name),
    ["Damage"],
  );

  input.setDown("dash", false);
  input.setDown("fire", false);
  run(player, PLAYER_DAMAGE_DURATION);
  assert.equal(player.is_executing("Damage"), false);
  assert.ok(player.currentLocomotion(), "normal locomotion resumed");
});

test("invulnerability outlasts knockback and rejects repeated hits", () => {
  const { world, player } = makePlayer();
  const enemy = new Actor(world, player.pos.x - 5, player.pos.y);

  player.damage(2, enemy);
  const after = player.current_health;
  player.damage(2, enemy);
  assert.equal(player.current_health, after);

  run(player, PLAYER_DAMAGE_DURATION + 0.1);
  assert.equal(player.is_executing("Damage"), false);
  assert.ok(player.is_invulnerable(), "i-frames continue after control returns");
  player.damage(2, enemy);
  assert.equal(player.current_health, after);

  run(player, PLAYER_DAMAGE_INVULNERABILITY);
  player.damage(2, enemy);
  assert.equal(player.current_health, after - 2);
});
