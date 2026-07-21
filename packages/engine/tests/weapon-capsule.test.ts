import { test } from "node:test";
import assert from "node:assert/strict";

import { DT, PICKUP_TICK_INTERVAL, SUB_WEAPON_MAX_AMMO, WEAPON_CAPSULE_STATS } from "../src/core/constants.js";
import { Input } from "../src/core/Input.js";
import { Player } from "../src/game/Player.js";
import { Stage } from "../src/game/Stage.js";
import { World } from "../src/game/World.js";

function room(): World {
  return World.fromRows(["....", "....", "...."]);
}

/**
 * A player with Dark Arrow selected and its tank drained to a known level.
 *
 * Draining takes hundreds of ticks (firing, waiting for the in-flight cap to
 * clear, repeat) in a room with no floor, which is otherwise exactly the room
 * the capsule tests want — so gravity is given the entire setup to pull the
 * player away from where a test's capsule is placed. Position and velocity are
 * reset back to the spawn point afterwards for exactly that reason.
 */
function darkArrowPlayer(startingAmmo: number): Player {
  const player = new Player(room(), 16, 16, new Input());
  player.input.setDown("weapon_right", true);
  player.tick(DT);
  player.input.setDown("weapon_right", false);
  assert.equal(player.activeWeapon, "dark_arrow");

  // Drain the tank down to `startingAmmo` by firing until it gets there —
  // there is no public setter, and going through the same fire path the game
  // uses is more honest than reaching into private state.
  while (player.getWeaponAmmo("dark_arrow") > startingAmmo) {
    player.input.setDown("fire", true);
    player.tick(DT);
    player.input.setDown("fire", false);
    for (let i = 0; i < 20; i++) player.tick(DT); // let the shot clear so the cap never gates fire
  }
  assert.equal(player.getWeaponAmmo("dark_arrow"), startingAmmo);

  player.pos.x = 16;
  player.pos.y = 16;
  player.velocity.set(0, 0);
  return player;
}

test("a small Weapon Energy capsule refills 2 ammo over several ticks, then despawns", () => {
  const world = room();
  const player = darkArrowPlayer(0);
  const stage = new Stage(world, player, {
    weaponCapsules: [{ id: "cap", kind: "small", x: 16 - 6, y: 16 - 6, w: 12, h: 12 }],
  });

  assert.equal(WEAPON_CAPSULE_STATS.small.ammo, 2);

  stage.tick(DT); // overlap detected, consuming begins
  assert.equal(stage.weaponCapsules.length, 1);
  assert.equal(stage.weaponCapsules[0].collecting, true);
  const ammoRightAfterTouch = player.getWeaponAmmo("dark_arrow");

  // Refilling is metered — one tick's worth of ~0.06s should not apply the
  // full capsule amount instantly.
  stage.tick(DT);
  assert.ok(
    player.getWeaponAmmo("dark_arrow") < ammoRightAfterTouch + WEAPON_CAPSULE_STATS.small.ammo,
    "capsule applied its full refill in a single frame",
  );

  const ticksNeeded = Math.ceil(PICKUP_TICK_INTERVAL / DT) * WEAPON_CAPSULE_STATS.small.ammo + 5;
  for (let i = 0; i < ticksNeeded; i++) stage.tick(DT);

  assert.equal(player.getWeaponAmmo("dark_arrow"), WEAPON_CAPSULE_STATS.small.ammo);
  assert.equal(stage.weaponCapsules.length, 0, "consumed capsule was reaped");
});

test("a large capsule collected near a full tank discards the unused overflow", () => {
  const world = room();
  const player = darkArrowPlayer(SUB_WEAPON_MAX_AMMO - 1);
  const stage = new Stage(world, player, {
    weaponCapsules: [{ id: "cap", kind: "large", x: 16 - 6, y: 16 - 6, w: 12, h: 12 }],
  });

  assert.equal(WEAPON_CAPSULE_STATS.large.ammo, 8);

  for (let i = 0; i < 30; i++) stage.tick(DT);

  assert.equal(player.getWeaponAmmo("dark_arrow"), SUB_WEAPON_MAX_AMMO);
  assert.equal(stage.weaponCapsules.length, 0, "capsule was fully consumed despite the overflow");
});

test("the stage freezes while a Weapon Energy capsule refills ammo, then resumes", () => {
  const world = room();
  const player = darkArrowPlayer(0);
  const stage = new Stage(world, player, {
    platforms: [{ id: "platform", x: 48, y: 16, w: 16, h: 8, travel: 32, speed: 60 }],
    weaponCapsules: [{ id: "cap", kind: "large", x: 16 - 6, y: 16 - 6, w: 12, h: 12 }],
  });

  stage.tick(DT); // overlap detected; recovery pause begins
  assert.equal(stage.weaponCapsules[0].collecting, true);

  const playerX = player.pos.x;
  const platformX = stage.platforms[0].x;
  player.input.setDown("move_right", true);

  stage.tick(DT);
  assert.equal(player.pos.x, playerX, "player moved during recovery");
  assert.equal(stage.platforms[0].x, platformX, "platform moved during recovery");

  while (stage.weaponCapsules.length > 0) stage.tick(DT);
  stage.tick(DT);

  assert.ok(player.pos.x > playerX, "player did not resume after recovery");
  assert.notEqual(stage.platforms[0].x, platformX, "platform did not resume");
});

test("collecting a Weapon Energy capsule with the buster equipped wastes it", () => {
  const world = room();
  const player = new Player(world, 16, 16, new Input());
  assert.equal(player.activeWeapon, "buster");
  const stage = new Stage(world, player, {
    weaponCapsules: [{ id: "cap", kind: "large", x: 16 - 6, y: 16 - 6, w: 12, h: 12 }],
  });

  for (let i = 0; i < 10; i++) stage.tick(DT);

  // AmmoPickup.gd redirects the whole amount into an unported ammo reserve the
  // instant it sees a weapon that is already "full" — refillWeaponAmmo is a
  // no-op for the buster, so that is every tick from the first.
  assert.equal(stage.weaponCapsules.length, 0, "capsule was consumed rather than left inert");
});

test("a Life and a Weapon Energy capsule never recover at the same time", () => {
  const world = room();
  const player = darkArrowPlayer(0);
  const stage = new Stage(world, player, {
    pickups: [{ id: "life", kind: "small", x: 16 - 6, y: 16 - 6, w: 12, h: 12 }],
    weaponCapsules: [{ id: "ammo", kind: "small", x: 16 - 6, y: 16 - 6, w: 12, h: 12 }],
  });

  stage.tick(DT);
  const lifeCollecting = stage.pickups[0].collecting;
  const ammoCollecting = stage.weaponCapsules[0].collecting;
  assert.notEqual(lifeCollecting, ammoCollecting, "exactly one of the two started recovering");
});

test("a Weapon Energy capsule falls under gravity and settles on the floor", () => {
  const world = World.fromRows([
    "....................",
    "....................",
    "....................",
    "####################",
  ]);
  const player = new Player(world, 300, 16, new Input()); // far from the capsule, on its own floor tile
  const stage = new Stage(world, player, {
    weaponCapsules: [{ id: "drop", kind: "small", x: 32, y: 0, w: 16, h: 16 }],
  });

  for (let i = 0; i < 30; i++) stage.tick(DT);

  const capsule = stage.weaponCapsules[0];
  assert.equal(capsule.y + capsule.h, 3 * 16, "capsule did not settle on the floor surface");

  const settledY = capsule.y;
  stage.tick(DT);
  assert.equal(capsule.y, settledY, "capsule kept moving after landing");
});
