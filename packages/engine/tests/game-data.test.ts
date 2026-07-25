import { test } from "node:test";
import assert from "node:assert/strict";

import {
  GAME_DATA,
  COMPILED_GAME_DATA,
  compileGameData,
  DEFAULT_COMPILE_REGISTRIES,
  hashGameData,
  type GameData,
  type GameDataDiagnostic,
} from "../src/data/index.js";

function clone(): GameData {
  return structuredClone(GAME_DATA);
}

function compile(data: GameData) {
  return compileGameData(data, DEFAULT_COMPILE_REGISTRIES);
}

function codes(diagnostics: GameDataDiagnostic[]): string[] {
  return diagnostics.filter((d) => d.severity === "error").map((d) => d.code);
}

// --- success ----------------------------------------------------------------

test("the default game data compiles with no error diagnostics", () => {
  const result = compile(clone());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.diagnostics.filter((d) => d.severity === "error").length, 0);
  }
});

test("COMPILED_GAME_DATA is available and reference-resolved", () => {
  const loadout = COMPILED_GAME_DATA.loadouts.get("player.x");
  assert.ok(loadout);
  assert.equal(loadout.actor.id, "player.x");
  assert.deepEqual(
    loadout.abilities.map((a) => a.id),
    [
      "player.idle",
      "player.walk",
      "player.fall",
      "player.wall-slide",
      "player.dash",
      "player.air-dash",
      "player.jump",
      "player.dash-jump",
      "player.wall-jump",
      "player.dash-wall-jump",
      "player.intro",
      "player.damage",
      "player.death",
      "player.shot",
      "player.charge",
    ],
  );
  const buster = COMPILED_GAME_DATA.weapons.get("buster");
  assert.equal(buster?.resolvedProjectiles.length, 3);
  assert.equal(buster?.resolvedProjectiles[2].id, "charged");
});

test("compiled enemy reaction tables are precomputed and hitboxes normalized", () => {
  const metool = COMPILED_GAME_DATA.enemies.get("metool");
  assert.ok(metool);
  assert.deepEqual(metool.reactions.see_player, ["Hide"]);
  assert.equal(metool.perception.ox, 0);
  assert.equal(metool.perception.oy, -6);
  assert.equal(metool.maxHealth, 2);
});

// --- hash -------------------------------------------------------------------

test("the content hash is stable and non-empty", () => {
  const a = compile(clone());
  const b = compile(clone());
  assert.equal(a.ok && b.ok, true);
  if (a.ok && b.ok) {
    assert.equal(a.value.hash, b.value.hash);
    assert.match(a.value.hash, /^[0-9a-f]{16}$/);
    assert.equal(a.value.hash, COMPILED_GAME_DATA.hash);
  }
});

test("the hash changes when a gameplay value changes", () => {
  const before = COMPILED_GAME_DATA.hash;
  const data = clone();
  data.projectiles.lemon.damage = 999;
  const after = compile(data);
  assert.equal(after.ok, true);
  if (after.ok) assert.notEqual(after.value.hash, before);
});

test("the hash is invariant to authoring key order", () => {
  const data = clone();
  const reordered: typeof data.projectiles = {} as typeof data.projectiles;
  for (const key of Object.keys(data.projectiles).reverse()) {
    reordered[key] = data.projectiles[key];
  }
  data.projectiles = reordered;
  const result = compile(data);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.hash, COMPILED_GAME_DATA.hash);
});

// --- diagnostics ------------------------------------------------------------

test("no partial compiled value is produced when errors exist", () => {
  const data = clone();
  data.projectiles.lemon.speed = 0;
  const result = compile(data);
  assert.equal(result.ok, false);
  assert.equal("value" in result, false);
});

test("a key/id mismatch is an error", () => {
  const data = clone();
  data.projectiles.lemon.id = "not-lemon";
  assert.ok(codes(compile(data).diagnostics).includes("id.mismatch"));
});

test("a missing actor reference is an error", () => {
  const data = clone();
  data.loadouts["player.x"].actor = "ghost";
  assert.ok(codes(compile(data).diagnostics).includes("reference.missing"));
});

test("a missing ability reference in a loadout is an error", () => {
  const data = clone();
  data.loadouts["player.x"].slots[0].ability = "ghost";
  assert.ok(codes(compile(data).diagnostics).includes("reference.missing"));
});

test("an unknown behavior id is an error", () => {
  const data = clone();
  data.abilities["player.dash"].behavior = "player.teleport";
  assert.ok(codes(compile(data).diagnostics).includes("behavior.unknown"));
});

test("a non-finite numeric value is an error", () => {
  const data = clone();
  data.physics.gravity = Number.POSITIVE_INFINITY;
  assert.ok(codes(compile(data).diagnostics).includes("value.number"));
});

test("an invalid priority is an error", () => {
  const data = clone();
  data.abilities["player.dash"].priority = Number.NaN;
  assert.ok(codes(compile(data).diagnostics).includes("value.number"));
});

test("non-ascending charge thresholds are an error", () => {
  const data = clone();
  data.weapons.buster.chargeThresholds = [2.75, 1.75];
  assert.ok(codes(compile(data).diagnostics).includes("charge.threshold"));
});

test("an invalid hitbox is an error", () => {
  const data = clone();
  data.projectiles.lemon.hitbox.hw = 0;
  assert.ok(codes(compile(data).diagnostics).includes("value.range"));
});

test("a missing projectile reference is an error", () => {
  const data = clone();
  data.weapons.buster.projectiles = ["ghost"];
  assert.ok(codes(compile(data).diagnostics).includes("projectile.missing"));
});

test("a missing prefab runtime is an error", () => {
  const data = clone();
  data.prefabs["enemy.metool"].runtime = "ghost";
  assert.ok(codes(compile(data).diagnostics).includes("prefab.runtime"));
});

test("an AI reaction naming an absent ability is an error", () => {
  const data = clone();
  data.enemies.metool.reactions.see_player = ["Teleport"];
  assert.ok(codes(compile(data).diagnostics).includes("reaction.missing"));
});

test("a hook referencing an unknown effect is an error", () => {
  const data = clone();
  data.enemies.bat.hooks = [{ on: "ability_end", ability: "Recoil", effect: "ghost" }];
  assert.ok(codes(compile(data).diagnostics).includes("behavior.unknown"));
});

test("hashGameData is a pure function of the compiled value", () => {
  assert.equal(hashGameData(COMPILED_GAME_DATA), COMPILED_GAME_DATA.hash);
});
