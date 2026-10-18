import { test } from "node:test";
import assert from "node:assert/strict";

import { DT } from "../src/core/constants.js";
import { Input } from "../src/core/Input.js";
import type { CompiledGameData, GameData } from "../src/data/index.js";
import { Player } from "../src/game/Player.js";
import { Stage } from "../src/game/Stage.js";
import { World } from "../src/game/World.js";
import { MMX_COMPILED, MMX_GAME_DATA, compileStrict } from "./support/mmx.js";

/**
 * The player is built and played from its compiled loadout and the scene's
 * game data alone (#145): weapons, their order and shots, health, body and
 * every ability's config come from data, with no constant behind them.
 */

// A 30x12 room: solid floor on the bottom row, walls on both sides.
function room(): World {
  const rows: string[] = [];
  for (let y = 0; y < 11; y++) rows.push("#" + ".".repeat(28) + "#");
  rows.push("#".repeat(30));
  return World.fromRows(rows);
}

/** Copy the MMX game data with `edit` applied, then compile it. */
function compiled(edit: (data: GameData) => void): CompiledGameData {
  const data = structuredClone(MMX_GAME_DATA) as GameData;
  edit(data);
  return compileStrict(data);
}

/** Settle on the floor, then tap fire `taps` times, 4 ticks apart. */
function shoot(player: Player, taps: number): Player {
  for (let i = 0; i < 10; i++) player.tick(DT);
  for (let n = 0; n < taps; n++) {
    player.input.setDown("fire", true);
    player.tick(DT);
    player.input.setDown("fire", false);
    for (let i = 0; i < 4; i++) player.tick(DT);
  }
  return player;
}

const x = (gameData = MMX_COMPILED, loadoutId = "player.x"): Player =>
  new Player(room(), 80, 160, new Input(), 1, loadoutId, gameData);

test("the player carries its loadout's weapons, in the loadout's order", () => {
  const player = x();
  assert.deepEqual(
    player.weapons.map((w) => w.id),
    ["buster", "dark_arrow"],
  );
  assert.equal(player.activeWeapon, "buster");
  assert.equal(player.getWeaponAmmo("buster"), Infinity);
  assert.equal(player.getWeaponAmmo("dark_arrow"), 28);

  const reordered = x(
    compiled((d) => {
      d.loadouts["player.x"]!.weapons = ["dark_arrow", "buster"];
      d.loadouts["player.x"]!.initialWeapon = "dark_arrow";
    }),
  );
  assert.equal(reordered.activeWeapon, "dark_arrow");
  reordered.input.setDown("weapon_right", true);
  reordered.tick(DT);
  assert.equal(reordered.activeWeapon, "buster", "cycles in the loadout's order");
});

test("a data change to the buster's shot cap changes how many shots fly", () => {
  assert.equal(shoot(x(), 5).projectiles.length, 3);
  const capped = compiled((d) => {
    d.weapons.buster!.maxLiveShots = 1;
  });
  assert.equal(shoot(x(capped), 5).projectiles.length, 1);
});

test("a data change to the lemon's damage changes the shot fired", () => {
  assert.equal(shoot(x(), 1).projectiles[0]!.damage, 1);
  const strong = compiled((d) => {
    d.projectiles.lemon!.damage = 7;
  });
  assert.equal(shoot(x(strong), 1).projectiles[0]!.damage, 7);
});

test("Zero carries no weapon: no buster, no Dark Arrow (user decision 2026-10-18)", () => {
  const zero = x(undefined, "player.zero");
  assert.deepEqual(zero.weapons, []);
  assert.equal(zero.activeWeapon, null);
  assert.equal(zero.getWeaponAmmo("dark_arrow"), 0);
});

test("an unarmed player can press fire, cycle and touch a capsule without crashing", () => {
  // X's moveset, Shot and Charge included, with no weapon at all.
  const unarmed = compiled((d) => {
    d.loadouts["player.x"]!.weapons = [];
    delete d.loadouts["player.x"]!.initialWeapon;
  });
  const player = x(unarmed);
  assert.equal(player.activeWeapon, null);
  assert.equal(player.canFireActiveWeapon(0), false);
  player.fireActiveWeapon(2);

  const stage = new Stage(
    player.world,
    player,
    { weaponCapsules: [{ id: "cap", kind: "small", x: 74, y: 154, w: 12, h: 12 }] },
    unarmed,
  );
  let refilled = 0;
  player.events.on("weapon_ammo_refilled", () => refilled++);
  for (let f = 0; f < 240; f++) {
    // Hold fire long enough to charge, tap both weapon buttons, then release.
    player.input.setDown("fire", f < 180);
    player.input.setDown("weapon_right", f % 20 === 0);
    player.input.setDown("weapon_left", f % 30 === 0);
    stage.tick(DT);
  }
  assert.equal(player.projectiles.length, 0);
  assert.equal(player.activeWeapon, null);
  assert.equal(player.is_executing("Charge"), false);
  assert.equal(refilled, 0);
  assert.equal(stage.weaponCapsules.length, 0, "the capsule was touched and spent for nothing");
});

test("a subclass slot inherits its parent slots' config, with no constant behind it", () => {
  // DashWallJump kicks with its loadout's wall-jump timing: X's 0.128s freeze,
  // and Zero's immediate kick (before #145 Zero borrowed X's constant).
  const delay = (loadoutId?: string): number =>
    (x(undefined, loadoutId).get_ability("DashWallJump") as unknown as { start_delay: number })
      .start_delay;
  assert.equal(delay(), 0.128);
  assert.equal(delay("player.zero"), 0);
  // AirDash keeps the dash slot's input leeway.
  assert.equal(x().get_ability("AirDash")!.get_activation_leeway_time(), 0.1);
});

test("game data without Zero still plays X", () => {
  const xOnly = compiled((d) => {
    delete d.loadouts["player.zero"];
    delete d.actors["player.zero"];
    for (const id of Object.keys(d.abilities)) if (id.startsWith("zero.")) delete d.abilities[id];
  });
  assert.equal(xOnly.loadouts.has("player.zero"), false);
  const player = shoot(x(xOnly), 2);
  assert.equal(player.projectiles.length, 2);
  assert.equal(player.max_health, 32);
});
