import { test } from "node:test";
import assert from "node:assert/strict";

import { Input, Action } from "../src/core/Input.js";
import { DT, SUB_WEAPON_CONFIG, SUB_WEAPON_MAX_AMMO } from "../src/core/constants.js";
import type { Charge } from "../src/engine/abilities/Charge.js";
import { Player } from "../src/engine/Player.js";
import { World } from "../src/engine/World.js";

/** A long open room, so shots have somewhere to fly without meeting a wall. */
function openRoom(): World {
  const rows: string[] = [];
  for (let y = 0; y < 11; y++) rows.push("#" + ".".repeat(78) + "#");
  rows.push("#".repeat(80));
  return World.fromRows(rows);
}

function makePlayer() {
  const input = new Input();
  const world = openRoom();
  const player = new Player(world, 5 * 16, 10 * 16, input);
  for (let i = 0; i < 5; i++) player.tick(DT);
  return { input, player };
}

function hold(input: Input, action: Action, down: boolean) {
  input.setDown(action, down);
}

/**
 * Press an action for exactly one tick, then release it and settle for one
 * more — without that extra tick, `Input`'s prev/cur snapshot never records the
 * release, and a second `tap` of the same action right after would not read as
 * a fresh just_pressed edge (see Input.newFrame).
 */
function tap(input: Input, player: Player, action: Action) {
  hold(input, action, true);
  player.tick(DT);
  hold(input, action, false);
  player.tick(DT);
}

/** One tap of fire: press for a frame, release, then let the shot get moving. */
function fire(input: Input, player: Player, gap = 4) {
  tap(input, player, "fire");
  for (let i = 0; i < gap; i++) player.tick(DT);
}

test("the player starts on the buster", () => {
  const { player } = makePlayer();
  assert.equal(player.activeWeapon, "buster");
});

test("weapon_right/weapon_left cycle the active weapon, wrapping around", () => {
  const { input, player } = makePlayer();

  tap(input, player, "weapon_right");
  assert.equal(player.activeWeapon, "dark_arrow");

  // Only two slots exist, so stepping right again wraps back to the buster.
  tap(input, player, "weapon_right");
  assert.equal(player.activeWeapon, "buster");

  tap(input, player, "weapon_left");
  assert.equal(player.activeWeapon, "dark_arrow", "weapon_left steps the other way");
});

test("tapping the opposite direction while one is held resets straight to the buster", () => {
  const { input, player } = makePlayer();
  tap(input, player, "weapon_right");
  assert.equal(player.activeWeapon, "dark_arrow");

  hold(input, "weapon_left", true);
  player.tick(DT);
  hold(input, "weapon_right", true);
  player.tick(DT);
  hold(input, "weapon_left", false);
  hold(input, "weapon_right", false);

  assert.equal(player.activeWeapon, "buster", "the chord is a panic button back to slot 0");
});

test("switching weapons emits weapon_changed exactly once per actual change", () => {
  const { input, player } = makePlayer();
  const seen: string[] = [];
  player.events.on("weapon_changed", (weapon: string) => seen.push(weapon));

  tap(input, player, "weapon_right");
  // Re-selecting the same direction twice in a row from the buster's neighbour
  // (dark_arrow) and back must not emit twice for one logical switch.
  player.tick(DT);
  tap(input, player, "weapon_left");

  assert.deepEqual(seen, ["dark_arrow", "buster"]);
});

test("firing with Dark Arrow selected spawns a dark_arrow projectile, not a lemon", () => {
  const { input, player } = makePlayer();
  tap(input, player, "weapon_right");
  assert.equal(player.activeWeapon, "dark_arrow");

  fire(input, player);
  assert.equal(player.projectiles.length, 1);
  assert.equal(player.projectiles[0].kind, "dark_arrow");
  assert.equal(player.projectiles[0].charge, 0, "no charged tier is ported for it");
});

test("switching back to the buster mid-session still fires lemons", () => {
  const { input, player } = makePlayer();
  tap(input, player, "weapon_right");
  fire(input, player);
  tap(input, player, "weapon_left");
  fire(input, player);

  const kinds = player.projectiles.map((p) => p.kind);
  assert.deepEqual(kinds, ["dark_arrow", "lemon"]);
});

test("Dark Arrow depletes its ammo tank and stops firing once empty", () => {
  const input = new Input();
  const world = openRoom();
  // Spawn hard against the right wall so every shot hits it (and goes "spent",
  // not live) within a tick or two — otherwise the in-flight cap (3) would gate
  // firing long before the ammo tank (28) ever ran dry, and this would end up
  // re-testing the cap instead of the ammo.
  const player = new Player(world, 77 * 16, 10 * 16, input);
  for (let i = 0; i < 5; i++) player.tick(DT);
  tap(input, player, "weapon_right");

  // Count shots fired rather than player.projectiles.length: spent shots near
  // the wall age out and are pruned within a handful of ticks (see
  // Character.updateProjectiles), so the live array is not a running total.
  let shotsFired = 0;
  player.events.on("shot_fired", () => shotsFired++);

  const config = SUB_WEAPON_CONFIG.dark_arrow!;
  const maxShots = Math.floor(SUB_WEAPON_MAX_AMMO / config.ammoCost);

  for (let i = 0; i < maxShots; i++) fire(input, player, 4);
  assert.equal(shotsFired, maxShots, "fired exactly the ammo the tank holds");

  fire(input, player, 4);
  assert.equal(shotsFired, maxShots, "out of ammo, no shot comes out");
});

test("charging is buster-only: holding fire with Dark Arrow selected never charges", () => {
  const { input, player } = makePlayer();
  tap(input, player, "weapon_right");
  const charge = () => player.get_ability("Charge") as Charge;

  hold(input, "fire", true);
  for (let i = 0; i < 400; i++) player.tick(DT);
  hold(input, "fire", false);
  player.tick(DT);

  assert.equal(charge().executing, false, "Charge never starts for a non-buster weapon");
  assert.ok(
    player.projectiles.every((p) => p.kind === "dark_arrow"),
    "holding fire just re-taps the regular Dark Arrow shot, never a charged buster",
  );
});
