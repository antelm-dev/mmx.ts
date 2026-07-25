import { test } from "node:test";
import assert from "node:assert/strict";

import {
  Registry,
  abilityRegistry,
  enemyBehaviorRegistry,
  buildCompileRegistries,
  validateConfig,
  notWired,
  type RegistryEntry,
} from "../src/behaviors/index.js";
import {
  GAME_DATA,
  compileGameData,
  type GameData,
  type GameDataDiagnostic,
} from "../src/data/index.js";

function clone(): GameData {
  return structuredClone(GAME_DATA);
}
function compile(data: GameData) {
  return compileGameData(data, buildCompileRegistries());
}
function errorCodes(d: GameDataDiagnostic[]): string[] {
  return d.filter((x) => x.severity === "error").map((x) => x.code);
}

// --- Registry mechanics -----------------------------------------------------

function stub(id: string): RegistryEntry {
  return { id, validate: () => ({ ok: true, value: undefined }) };
}

test("a registry resolves, reports membership, and enumerates deterministically", () => {
  const r = new Registry<RegistryEntry>();
  r.register(stub("charlie")).register(stub("alpha")).register(stub("bravo"));
  assert.equal(r.has("alpha"), true);
  assert.equal(r.has("delta"), false);
  assert.equal(r.get("bravo").id, "bravo");
  // ids() is sorted regardless of registration order.
  assert.deepEqual(r.ids(), ["alpha", "bravo", "charlie"]);
});

test("registering a duplicate id throws", () => {
  const r = new Registry<RegistryEntry>();
  r.register(stub("dup"));
  assert.throws(() => r.register(stub("dup")), /duplicate/);
});

test("resolving an unknown id throws rather than returning undefined", () => {
  const r = new Registry<RegistryEntry>();
  assert.throws(() => r.get("ghost"), /unknown/);
});

test("an unwired create throws a descriptive error", () => {
  assert.throws(() => notWired("player.dash", "Part 5"), /wired in Part 5/);
});

// --- Config validation -------------------------------------------------------

test("validateConfig accepts a well-formed config", () => {
  const r = validateConfig({ speed: "number", on: "boolean" }, { speed: 90, on: true });
  assert.equal(r.ok, true);
});

test("validateConfig rejects unknown keys (no silent ignore)", () => {
  const r = validateConfig({ speed: "number" }, { speed: 90, bogus: 1 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.issues.some((i) => i.fieldPath === "bogus"));
});

test("validateConfig rejects a missing required key", () => {
  const r = validateConfig({ speed: "number", duration: "number" }, { speed: 90 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.issues.some((i) => i.fieldPath === "duration"));
});

test("validateConfig rejects a wrong-typed value", () => {
  const r = validateConfig({ speed: "number" }, { speed: "fast" });
  assert.equal(r.ok, false);
});

// --- Registries back compilation --------------------------------------------

test("buildCompileRegistries covers every behaviour the default data references", () => {
  const result = compile(clone());
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.diagnostics.filter((d) => d.severity === "error").length, 0);
  }
});

test("the ability registry knows every player ability id", () => {
  for (const id of Object.keys(GAME_DATA.abilities)) {
    assert.equal(abilityRegistry.has(id), true, `missing ${id}`);
  }
});

test("the enemy-behaviour registry knows every enemy ability id", () => {
  for (const enemy of Object.values(GAME_DATA.enemies)) {
    for (const ability of enemy.abilities) {
      assert.equal(enemyBehaviorRegistry.has(ability), true, `missing ${ability}`);
    }
  }
});

test("an unknown ability behaviour fails compilation against the real registries", () => {
  const data = clone();
  data.abilities["player.dash"].behavior = "player.teleport";
  assert.ok(errorCodes(compile(data).diagnostics).includes("behavior.unknown"));
});

test("an unknown enemy behaviour fails compilation", () => {
  const data = clone();
  data.enemies.metool.abilities = ["Patrol", "Levitate", "Death"];
  data.enemies.metool.reactions = { idle: ["Patrol"], guard_break: ["Death"] };
  assert.ok(errorCodes(compile(data).diagnostics).includes("behavior.unknown"));
});

test("an ability config with an unknown key fails compilation", () => {
  const data = clone();
  data.abilities["player.dash"].config = { speed: 200, duration: 0.55, leeway: 0.1, bogus: 1 };
  assert.ok(errorCodes(compile(data).diagnostics).includes("config.invalid"));
});

test("an ability config missing a required key fails compilation", () => {
  const data = clone();
  data.abilities["player.dash"].config = { speed: 200, duration: 0.55 };
  assert.ok(errorCodes(compile(data).diagnostics).includes("config.invalid"));
});
