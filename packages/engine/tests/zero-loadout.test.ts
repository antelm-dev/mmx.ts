import { test } from "node:test";
import assert from "node:assert/strict";

import { Input, type Action } from "../src/core/Input.js";
import { DT } from "../src/core/constants.js";
import { World } from "../src/game/World.js";
import { Player } from "../src/game/Player.js";
import { GAME_DATA } from "../src/data/gameData.js";
import { compileGameData } from "../src/data/compileGameData.js";
import { COMPILED_GAME_DATA } from "../src/data/index.js";
import { buildCompileRegistries } from "../src/behaviors/index.js";

// A 30x12 room: solid floor on the bottom row, walls on both sides.
function room(): World {
  const rows: string[] = [];
  for (let y = 0; y < 11; y++) rows.push("#" + ".".repeat(28) + "#");
  rows.push("#".repeat(30));
  return World.fromRows(rows);
}

test("the default game data, Zero included, compiles without diagnostics", () => {
  const result = compileGameData(GAME_DATA, buildCompileRegistries());
  assert.deepEqual(result.diagnostics, []);
  const zero = COMPILED_GAME_DATA.loadouts.get("player.zero");
  assert.ok(zero);
  assert.deepEqual(zero.weapons, []);
  assert.equal(zero.actor.maxHealth, 16);
});

test("an armed loadout still needs an initialWeapon", () => {
  const bad = { id: "bad", actor: "player.zero", slots: [], weapons: ["buster"] };
  const result = compileGameData(
    { ...GAME_DATA, loadouts: { ...GAME_DATA.loadouts, bad } },
    buildCompileRegistries(),
  );
  assert.ok(result.diagnostics.some((d) => d.fieldPath === "loadouts.bad.initialWeapon"));
});

test("a Player composes from the Zero loadout headlessly", () => {
  const player = new Player(room(), 80, 160, new Input(), 1, "player.zero");
  assert.deepEqual(
    player.moveset.map((m) => m.name),
    [
      "Idle",
      "Walk",
      "Fall",
      "WallSlide",
      "Dash",
      "Jump",
      "DashJump",
      "WallJump",
      "DashWallJump",
      "Damage",
      "Death",
    ],
  );
});

test("Zero's jump is the GBA impulse: 5 px/f up, 0.25 px/f² down -> 47.5 px apex", () => {
  const input = new Input();
  const player = new Player(room(), 80, 160, input, 1, "player.zero");
  for (let i = 0; i < 10; i++) player.tick(DT);
  const floorY = player.pos.y;
  let apex = floorY;
  input.setDown("jump", true);
  for (let i = 0; i < 60; i++) {
    player.tick(DT);
    apex = Math.min(apex, player.pos.y);
  }
  assert.ok(Math.abs(floorY - apex - 47.5) < 1e-6, `apex ${floorY - apex}`);
});

/** Run, jump, dash, then wall-jump off the right wall; one line per tick. */
function replay(): { trace: string; states: Set<string> } {
  const input = new Input();
  const player = new Player(room(), 80, 160, input, 7, "player.zero");
  const held = (f: number): Action[] => {
    const a: Action[] = [];
    if (f >= 10) a.push("move_right");
    if ((f >= 30 && f < 40) || (f >= 205 && f < 225) || (f >= 232 && f < 245)) a.push("jump");
    if (f >= 70 && f < 100) a.push("dash");
    return a;
  };
  const lines: string[] = [];
  const states = new Set<string>();
  for (let f = 0; f < 260; f++) {
    const a = held(f);
    for (const action of ["move_right", "jump", "dash"] as const)
      input.setDown(action, a.includes(action));
    player.tick(DT);
    const s = player.stateString();
    for (const name of s.split(" ")) states.add(name);
    lines.push(`${player.pos.x},${player.pos.y},${player.velocity.x},${player.velocity.y},${s}`);
  }
  return { trace: lines.join("\n"), states };
}

test("a scripted Zero replay (run, jump, dash, wall jump) is deterministic", () => {
  const a = replay();
  const b = replay();
  assert.equal(a.trace, b.trace);
  for (const s of ["Walk", "Jump", "Dash", "WallSlide", "WallJump"]) {
    assert.ok(a.states.has(s), `script should reach ${s}; saw ${[...a.states].join(",")}`);
  }
});
