import { test } from "node:test";
import assert from "node:assert/strict";

import { Input } from "../src/core/Input.js";
import { DASH_SPEED } from "../src/core/constants.js";
import { World } from "../src/game/World.js";
import { Player } from "../src/game/Player.js";
import { Dash } from "../src/game/abilities/Dash.js";
import { Jump } from "../src/game/abilities/Jump.js";
import { Charge } from "../src/game/abilities/Charge.js";
import { COMPILED_GAME_DATA } from "../src/data/index.js";
import { abilityRegistry, type RuntimeContext } from "../src/behaviors/index.js";

function room(): World {
  const rows: string[] = [];
  for (let y = 0; y < 10; y++) rows.push("#" + ".".repeat(38) + "#");
  rows.push("#".repeat(40));
  return World.fromRows(rows);
}

function makePlayer(): Player {
  return new Player(room(), 200, 100, new Input());
}

// --- composition comes from the compiled loadout ----------------------------

test("the player's moveset is composed from the compiled loadout", () => {
  const player = makePlayer();
  const loadout = COMPILED_GAME_DATA.loadouts.get("player.x");
  assert.ok(loadout);
  assert.equal(player.moveset.length, loadout.abilities.length);
  loadout.abilities.forEach((compiled, i) => {
    const inst = player.moveset[i];
    assert.equal(inst.priority, compiled.priority, `priority @${i} (${compiled.id})`);
    assert.equal(inst.independent, compiled.layer === "action", `independent @${i} (${compiled.id})`);
  });
});

test("the compiled X loadout still produces the exact Player.tscn ability order", () => {
  const player = makePlayer();
  assert.deepEqual(
    player.moveset.map((m) => m.name),
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

test("the initial weapon matches the loadout", () => {
  const player = makePlayer();
  const loadout = COMPILED_GAME_DATA.loadouts.get("player.x");
  assert.equal(player.activeWeapon, loadout?.initialWeapon);
});

// --- abilities accept typed config ------------------------------------------

test("Dash honours typed config, and falls back to constants without it", () => {
  const player = makePlayer();
  const tuned = new Dash(player, { speed: 999, duration: 1.5, leeway: 0.25 });
  assert.equal(tuned.horizontal_velocity, 999);
  assert.equal(tuned.dash_duration, 1.5);
  assert.equal(tuned.leeway, 0.25);

  const bare = new Dash(player);
  assert.equal(bare.horizontal_velocity, DASH_SPEED);
});

test("Jump honours a configured velocity", () => {
  const player = makePlayer();
  assert.equal(new Jump(player, { velocity: 500 }).jump_velocity, 500);
});

test("Charge honours configured thresholds", () => {
  const player = makePlayer();
  const tuned = new Charge(player, { minTime: 0.5, level3: 1.0, level4: 2.75, maxTime: 5 });
  tuned.charged_time = 1.5;
  assert.equal(tuned.get_charge_level(), 2, "1.5s clears the lowered level-3 threshold");

  const bare = new Charge(player);
  bare.charged_time = 1.5;
  assert.equal(bare.get_charge_level(), 1, "1.5s is below the default 1.75s level-3 threshold");
});

// --- registry resolution ----------------------------------------------------

test("the ability registry resolves player behaviours to real instances", () => {
  const player = makePlayer();
  const ctx: RuntimeContext = { gameData: COMPILED_GAME_DATA };
  const dash = abilityRegistry
    .get("player.dash")
    .create(player, { speed: 200, duration: 0.55, leeway: 0.1 }, ctx);
  assert.ok(dash instanceof Dash);
});
