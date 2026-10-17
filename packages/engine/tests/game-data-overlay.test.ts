import { test } from "node:test";
import assert from "node:assert/strict";

import { mergeGameData, type GameDataOverlay } from "../src/data/index.js";
import { MMX_GAME_DATA } from "./support/mmx.js";

const crab = { ...MMX_GAME_DATA.enemies.metool!, id: "crab", sheet: "anim.enemy.crab" };

test("mergeGameData adds new records and replaces records with the same id", () => {
  const base = structuredClone(MMX_GAME_DATA);
  const metool = { ...MMX_GAME_DATA.enemies.metool!, touchDamage: 9 };
  const result = mergeGameData(base, { schemaVersion: 1, enemies: { crab, metool } });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.enemies.crab, crab);
  assert.equal(result.value.enemies.metool!.touchDamage, 9);
  assert.deepEqual(result.value.enemies.bat, MMX_GAME_DATA.enemies.bat);
  assert.equal(result.value.weapons, base.weapons);
  // Pure: the base is untouched.
  assert.deepEqual(base, MMX_GAME_DATA);
});

test("mergeGameData with an empty overlay equals the base", () => {
  const result = mergeGameData(MMX_GAME_DATA, {});
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value, MMX_GAME_DATA);
});

test("mergeGameData is deterministic", () => {
  const overlay: GameDataOverlay = { enemies: { crab } };
  const a = mergeGameData(MMX_GAME_DATA, overlay);
  const b = mergeGameData(MMX_GAME_DATA, overlay);
  assert.deepEqual(a, b);
});

test("mergeGameData rejects unsupported categories, schema mismatches and malformed records", () => {
  const result = mergeGameData(MMX_GAME_DATA, {
    schemaVersion: 2,
    weapons: {},
    enemies: { crab: 1 },
  } as unknown as GameDataOverlay);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(
    result.diagnostics.map((d) => [d.code, d.fieldPath]),
    [
      ["overlay.schemaVersion", "schemaVersion"],
      ["overlay.category", "weapons"],
      ["overlay.invalid", "enemies.crab"],
    ],
  );
  assert.equal(mergeGameData(MMX_GAME_DATA, [] as unknown as GameDataOverlay).ok, false);
});

test("mergeGameData merges pickups, environments and projectiles by id", () => {
  const result = mergeGameData(MMX_GAME_DATA, {
    pickups: { "life.small": { ...MMX_GAME_DATA.pickups["life.small"]!, amount: 5 } },
    environments: {
      "moving-platform": {
        ...MMX_GAME_DATA.environments["moving-platform"]!,
        defaults: { travel: 10, speed: 20 },
      },
    },
    projectiles: { pantheon_shot: { ...MMX_GAME_DATA.projectiles.pantheon_shot!, damage: 5 } },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.pickups["life.small"]!.amount, 5);
  assert.deepEqual(result.value.pickups["life.large"], MMX_GAME_DATA.pickups["life.large"]);
  assert.deepEqual(result.value.environments["moving-platform"]!.defaults, {
    travel: 10,
    speed: 20,
  });
  assert.equal(result.value.projectiles.pantheon_shot!.damage, 5);
  assert.deepEqual(result.value.projectiles.lemon, MMX_GAME_DATA.projectiles.lemon);
});

test("mergeGameData refuses to replace a projectile a weapon fires", () => {
  const result = mergeGameData(MMX_GAME_DATA, {
    projectiles: { lemon: { ...MMX_GAME_DATA.projectiles.lemon!, damage: 9 } },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(
    result.diagnostics.map((d) => [d.code, d.fieldPath]),
    [["overlay.projectile", "projectiles.lemon"]],
  );
});
