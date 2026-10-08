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

test("each loadout's actor sets the runtime body and health", () => {
  const x = new Player(room(), 80, 160, new Input(), 1);
  const zero = new Player(room(), 80, 160, new Input(), 1, "player.zero");
  assert.deepEqual([x.hw, x.hh, x.body_hh, x.max_health, x.current_health], [6, 14, 14, 32, 32]);
  assert.deepEqual(
    [zero.hw, zero.hh, zero.body_hh, zero.max_health, zero.current_health],
    [7, 15, 15, 16, 16],
  );
});

test("X and Zero bodies collide differently under a low ceiling", () => {
  // Floor top at y=176 and a solid ceiling row whose underside is y=144: a 32px gap.
  const lowRoom = (): World => {
    const rows: string[] = [];
    for (let y = 0; y < 11; y++) rows.push("#" + (y === 8 ? "#" : ".").repeat(28) + "#");
    rows.push("#".repeat(30));
    return World.fromRows(rows);
  };
  const jumpTop = (loadout: string): number => {
    const input = new Input();
    const p = new Player(lowRoom(), 80, 160, input, 1, loadout);
    for (let i = 0; i < 10; i++) p.tick(DT);
    input.setDown("jump", true);
    let top = p.pos.y;
    for (let i = 0; i < 30; i++) {
      p.tick(DT);
      top = Math.min(top, p.pos.y);
    }
    return top;
  };
  // The head bumps the ceiling when the centre is exactly one half-height below it.
  assert.equal(jumpTop("player.x"), 144 + 14);
  assert.equal(jumpTop("player.zero"), 144 + 15);
});

test("Zero's abilities run on Zero's configs, not X's", () => {
  // X and Zero share walk speed (90), so check values that differ.
  const knockback = (loadout: string): number => {
    const p = new Player(room(), 80, 160, new Input(), 1, loadout);
    for (let i = 0; i < 10; i++) p.tick(DT);
    p.damage(1);
    p.tick(DT);
    return Math.abs(p.velocity.x);
  };
  assert.equal(knockback("player.x"), 45);
  assert.equal(knockback("player.zero"), 60);

  const zero = new Player(room(), 80, 160, new Input(), 1, "player.zero");
  const ability = (name: string) => zero.get_ability(name) as unknown as Record<string, number>;
  assert.equal(ability("DashJump").horizontal_velocity, 210);
  assert.equal(ability("DashWallJump").horizontal_velocity, 210);
  assert.equal(ability("WallJump").move_away_speed, 90);
  assert.equal(ability("WallJump").start_delay, 0);
  assert.equal(ability("Damage").invulnerability_time, 1);
  assert.equal(ability("Damage").duration_time, 0.4);
});

test("Zero's wall and dash jumps inherit zero.jump's rise, not X's", () => {
  const zero = new Player(room(), 80, 160, new Input(), 1, "player.zero");
  const rise = (name: string) => {
    const a = zero.get_ability(name) as unknown as Record<string, number>;
    return [a.jump_velocity, a.max_jump_time, a.leeway_time, a.fullspeed_proportion];
  };
  assert.deepEqual(rise("Jump"), [300, 0.016, 0.1, 1]);
  for (const name of ["DashJump", "WallJump", "DashWallJump"]) {
    assert.deepEqual(rise(name), rise("Jump"), name);
  }

  // Jump at the right wall, then wall-kick off it; measure the kick's rise.
  const wallKickRise = (loadout: string): number => {
    const input = new Input();
    const p = new Player(room(), 440, 160, input, 1, loadout);
    input.setDown("move_right", true);
    for (let i = 0; i < 10; i++) p.tick(DT);
    input.setDown("jump", true);
    for (let i = 0; i < 12; i++) p.tick(DT);
    input.setDown("jump", false);
    p.tick(DT);
    input.setDown("jump", true);
    p.tick(DT);
    assert.ok(p.is_executing("WallJump"), `${loadout}: ${p.stateString()}`);
    const start = p.pos.y;
    let apex = start;
    for (let i = 0; i < 60; i++) {
      p.tick(DT);
      apex = Math.min(apex, p.pos.y);
    }
    return start - apex;
  };
  const x = wallKickRise("player.x");
  const z = wallKickRise("player.zero");
  assert.ok(x > 0 && z > 0 && Math.abs(x - z) > 1, `X ${x} vs Zero ${z}`);
});
