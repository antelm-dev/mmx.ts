import { test } from "node:test";
import assert from "node:assert/strict";

import {
  Registry,
  abilityRegistry,
  enemyBehaviorRegistry,
  environmentBehaviorRegistry,
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

test("the ability registry knows every player ability's behaviour", () => {
  for (const { id, behavior } of Object.values(GAME_DATA.abilities)) {
    assert.equal(abilityRegistry.has(behavior), true, `missing ${behavior} (${id})`);
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

test("an enemy ability config with an unknown key fails compilation", () => {
  const data = clone();
  data.enemies.metool.abilityConfig!.Patrol.travelSpeeed = 30;
  const diagnostics = compile(data).diagnostics;
  assert.ok(
    diagnostics.some(
      (d) =>
        d.code === "config.invalid" &&
        d.fieldPath === "enemies.metool.abilityConfig.Patrol.travelSpeeed",
    ),
  );
});

test("an enemy ability config for an ability the enemy does not own fails compilation", () => {
  const data = clone();
  data.enemies.bat.abilityConfig!.Hide = { ...data.enemies.metool.abilityConfig!.Hide };
  assert.ok(errorCodes(compile(data).diagnostics).includes("config.invalid"));
});

test("an enemy ability config missing a key or out of range fails compilation", () => {
  const data = clone();
  delete data.enemies.bat.abilityConfig!.Recoil.duration;
  data.enemies.bat.abilityConfig!.Hover.area = 0;
  const paths = compile(data).diagnostics.map((d) => d.fieldPath);
  assert.ok(paths.includes("enemies.bat.abilityConfig.Recoil.duration"));
  assert.ok(paths.includes("enemies.bat.abilityConfig.Hover.area"));
});

test("an enemy ability config whose conflicts name an ability the enemy does not own fails compilation", () => {
  const data = clone();
  data.enemies.metool.abilityConfig!.Patrol.conflicts = ["Hide", "Stunn"];
  const missing = compile(data).diagnostics.filter((d) => d.code === "reaction.missing");
  assert.deepEqual(
    missing.map((d) => d.fieldPath),
    ["enemies.metool.abilityConfig.Patrol.conflicts"],
  );
});

test("a Shoot config naming an unknown projectile fails compilation", () => {
  const data = clone();
  data.enemies.pantheon.abilityConfig!.Shoot.projectile = "ghost_shot";
  const missing = compile(data).diagnostics.filter((d) => d.code === "reference.missing");
  assert.deepEqual(
    missing.map((d) => d.fieldPath),
    ["enemies.pantheon.abilityConfig.Shoot.projectile"],
  );
});

// --- Environment debug geometry ---------------------------------------------

test("a moving platform's debug geometry is its travel path and end rectangle on its axis", () => {
  const geometry = environmentBehaviorRegistry.get("environment.moving-platform").debugGeometry!;
  const at = { x: 100, y: 50, facing: 1, width: 48, height: 8 };
  assert.deepEqual(geometry({ Travel: 40, Speed: 48, Axis: "vertical" }, at), [
    { kind: "line", role: "movement-path", from: { x: 124, y: 54 }, to: { x: 124, y: 94 } },
    { kind: "rect", role: "movement-path", x: 100, y: 90, width: 48, height: 8, label: "end" },
  ]);
  const horizontal = geometry({ Travel: 40, Axis: "horizontal" }, at);
  assert.deepEqual(horizontal[0], {
    kind: "line",
    role: "movement-path",
    from: { x: 124, y: 54 },
    to: { x: 164, y: 54 },
  });
  // Unset Travel falls back to the built-in default; no travel, no path.
  assert.equal((geometry({}, at)[1] as { x: number }).x, 196);
  assert.deepEqual(geometry({ Travel: 0 }, at), []);
  assert.equal(
    environmentBehaviorRegistry.get("environment.falling-platform").debugGeometry,
    undefined,
  );
});
