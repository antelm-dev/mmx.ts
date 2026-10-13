import { test } from "node:test";
import assert from "node:assert/strict";

import { GAME_DATA, mergeGameData, type GameDataOverlay } from "../src/data/index.js";

const crab = { ...GAME_DATA.enemies.metool!, id: "crab", sheet: "anim.enemy.crab" };

test("mergeGameData adds new records and replaces records with the same id", () => {
  const base = structuredClone(GAME_DATA);
  const metool = { ...GAME_DATA.enemies.metool!, touchDamage: 9 };
  const result = mergeGameData(base, { schemaVersion: 1, enemies: { crab, metool } });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.enemies.crab, crab);
  assert.equal(result.value.enemies.metool!.touchDamage, 9);
  assert.deepEqual(result.value.enemies.bat, GAME_DATA.enemies.bat);
  assert.equal(result.value.weapons, base.weapons);
  // Pure: the base is untouched.
  assert.deepEqual(base, GAME_DATA);
});

test("mergeGameData with an empty overlay equals the base", () => {
  const result = mergeGameData(GAME_DATA, {});
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value, GAME_DATA);
});

test("mergeGameData is deterministic", () => {
  const overlay: GameDataOverlay = { enemies: { crab } };
  const a = mergeGameData(GAME_DATA, overlay);
  const b = mergeGameData(GAME_DATA, overlay);
  assert.deepEqual(a, b);
});

test("mergeGameData rejects unsupported categories, schema mismatches and malformed records", () => {
  const result = mergeGameData(GAME_DATA, {
    schemaVersion: 2,
    pickups: {},
    enemies: { crab: 1 },
  } as unknown as GameDataOverlay);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(
    result.diagnostics.map((d) => [d.code, d.fieldPath]),
    [
      ["overlay.schemaVersion", "schemaVersion"],
      ["overlay.category", "pickups"],
      ["overlay.invalid", "enemies.crab"],
    ],
  );
  assert.equal(mergeGameData(GAME_DATA, [] as unknown as GameDataOverlay).ok, false);
});
