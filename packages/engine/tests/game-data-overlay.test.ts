import { test } from "node:test";
import assert from "node:assert/strict";

import { buildCompileRegistries } from "../src/behaviors/index.js";
import { compileGameData, mergeGameData, type GameDataOverlay } from "../src/data/index.js";
import { Scene } from "../src/game/Scene.js";
import { stage1 } from "./fixtures/levels.js";
import { MMX_GAME_DATA, compileStrict } from "./support/mmx.js";

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
    physics: {},
    enemies: { crab: 1 },
  } as unknown as GameDataOverlay);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(
    result.diagnostics.map((d) => [d.code, d.fieldPath]),
    [
      ["overlay.schemaVersion", "schemaVersion"],
      ["overlay.category", "physics"],
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

test("mergeGameData merges abilities, loadouts, weapons and fired projectiles by id", () => {
  const speedy = { ...MMX_GAME_DATA.loadouts["player.x"]!, id: "player.speedy" };
  const result = mergeGameData(MMX_GAME_DATA, {
    abilities: {
      "player.walk": { ...MMX_GAME_DATA.abilities["player.walk"]!, priority: 3 },
    },
    loadouts: { "player.speedy": speedy },
    weapons: { buster: { ...MMX_GAME_DATA.weapons.buster!, maxLiveShots: 1 } },
    projectiles: { lemon: { ...MMX_GAME_DATA.projectiles.lemon!, damage: 9 } },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.abilities["player.walk"]!.priority, 3);
  assert.deepEqual(result.value.loadouts["player.speedy"], speedy);
  assert.deepEqual(result.value.loadouts["player.x"], MMX_GAME_DATA.loadouts["player.x"]);
  assert.equal(result.value.weapons.buster!.maxLiveShots, 1);
  assert.equal(result.value.projectiles.lemon!.damage, 9);
  assert.equal(compileStrict(result.value).loadouts.has("player.speedy"), true);
});

test("game data without any loadout compiles and reports that no player can spawn", () => {
  const data = structuredClone(MMX_GAME_DATA);
  data.loadouts = {};
  const result = compileGameData(data, buildCompileRegistries());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.diagnostics.map((d) => [d.severity, d.code, d.fieldPath]),
    [["warning", "player.missing", "prefabs.spawn.source"]],
  );
  assert.match(result.diagnostics[0]!.message, /player\.x/);
  // The level that places the spawn says so when its player is built.
  assert.throws(
    () => Scene.create({ level: stage1, seed: 1, gameData: result.value }),
    /unknown loadout 'player\.x'/,
  );
});

test("a loadout that can jump without a walk or fall slot is a warning", () => {
  const data = structuredClone(MMX_GAME_DATA);
  const x = data.loadouts["player.x"]!;
  x.slots = x.slots.filter((s) => s.ability !== "player.walk");
  const result = compileGameData(data, buildCompileRegistries());
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.diagnostics.map((d) => [d.severity, d.code, d.definitionId]),
    [["warning", "loadout.airControl", "player.x"]],
  );
  assert.match(result.diagnostics[0]!.message, /player\.walk/);
});
