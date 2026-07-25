import { test } from "node:test";
import assert from "node:assert/strict";

import { Tile } from "../src/game/World.js";
import type { LevelData, LevelEntity } from "../src/game/LevelData.js";
import {
  compileLevel,
  loadLevel,
  LevelCompileError,
  type EngineDiagnostic,
} from "../src/game/level.js";
import { Scene } from "../src/game/Scene.js";

/**
 * A 12x8 grid with a solid floor along the bottom row — enough for a valid
 * compile, plus whatever entities a case adds. Every entity gets a positive box
 * and a unique iid unless the case deliberately breaks one.
 */
const COLS = 12;
const ROWS = 8;
const GRID = 16;

function floorTiles(): Tile[] {
  const tiles = new Array<Tile>(COLS * ROWS).fill(Tile.Empty);
  for (let c = 0; c < COLS; c++) tiles[(ROWS - 1) * COLS + c] = Tile.Solid;
  return tiles;
}

function entity(over: Partial<LevelEntity> & { id: string; iid: string }): LevelEntity {
  return { x: 32, y: 32, w: 16, h: 16, fields: {}, ...over };
}

const SPAWN = entity({ id: "Spawn", iid: "spawn-1", x: 32, y: (ROWS - 2) * GRID });

function level(entities: LevelEntity[]): LevelData {
  return {
    identifier: "test",
    gridSize: GRID,
    cols: COLS,
    rows: ROWS,
    tiles: floorTiles(),
    entities,
  };
}

function find(diagnostics: EngineDiagnostic[], code: string): EngineDiagnostic | undefined {
  return diagnostics.find((d) => d.code === code);
}

// --- Successful compilation -------------------------------------------------

test("a valid level compiles to a runtime with no error diagnostics", () => {
  const result = compileLevel(level([SPAWN]));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.spawn.x, SPAWN.x);
    assert.equal(result.diagnostics.filter((d) => d.severity === "error").length, 0);
  }
});

test("compileLevel never returns a partial runtime when errors exist", () => {
  const result = compileLevel(level([]));
  assert.equal(result.ok, false);
  assert.equal("value" in result, false);
});

// --- Each diagnostic --------------------------------------------------------

test("exactly one Spawn is required", () => {
  assert.ok(find(compileLevel(level([])).diagnostics, "spawn.count"));
  const two = compileLevel(level([SPAWN, entity({ id: "Spawn", iid: "spawn-2" })]));
  assert.ok(find(two.diagnostics, "spawn.count"));
});

test("duplicate entity iids are an error", () => {
  const dup = compileLevel(
    level([SPAWN, entity({ id: "Hazard", iid: "dup" }), entity({ id: "Hazard", iid: "dup" })]),
  );
  const d = find(dup.diagnostics, "id.duplicate");
  assert.ok(d);
  assert.equal(d?.severity, "error");
  assert.equal(d?.entityId, "dup");
});

test("an unknown entity type is a warning, not a blocking error", () => {
  const result = compileLevel(level([SPAWN, entity({ id: "Teleporter", iid: "t1" })]));
  const d = find(result.diagnostics, "entity.unknown");
  assert.equal(d?.severity, "warning");
  assert.equal(result.ok, true);
});

test("an unsupported enemy Kind is an error attached to Kind", () => {
  const result = compileLevel(
    level([SPAWN, entity({ id: "Enemy", iid: "e1", fields: { Kind: "dragon" } })]),
  );
  const d = find(result.diagnostics, "enemy.kind");
  assert.equal(d?.severity, "error");
  assert.equal(d?.field, "Kind");
  assert.equal(d?.entityId, "e1");
});

test("an unsupported capsule Kind is an error attached to Kind", () => {
  const life = compileLevel(
    level([SPAWN, entity({ id: "LifeCapsule", iid: "l1", fields: { Kind: "huge" } })]),
  );
  assert.equal(find(life.diagnostics, "pickup.kind")?.field, "Kind");
  const weapon = compileLevel(
    level([SPAWN, entity({ id: "WeaponCapsule", iid: "w1", fields: { Kind: "huge" } })]),
  );
  assert.equal(find(weapon.diagnostics, "pickup.kind")?.severity, "error");
});

test("a non-finite numeric field is an error attached to the field", () => {
  const badTransform = compileLevel(level([SPAWN, entity({ id: "Hazard", iid: "h1", x: NaN })]));
  assert.equal(find(badTransform.diagnostics, "transform.finite")?.field, "x");

  const badSpeed = compileLevel(
    level([
      SPAWN,
      entity({ id: "Conveyor", iid: "c1", fields: { Speed: Number.POSITIVE_INFINITY } }),
    ]),
  );
  assert.equal(find(badSpeed.diagnostics, "field.number")?.field, "Speed");
});

test("negative moving-platform Travel or Speed is an error", () => {
  const travel = compileLevel(
    level([SPAWN, entity({ id: "MovingPlatform", iid: "p1", fields: { Travel: -8 } })]),
  );
  assert.equal(find(travel.diagnostics, "field.nonNegative")?.field, "Travel");
  const speed = compileLevel(
    level([SPAWN, entity({ id: "MovingPlatform", iid: "p2", fields: { Speed: -8 } })]),
  );
  assert.equal(find(speed.diagnostics, "field.nonNegative")?.field, "Speed");
});

test("a non-positive entity width or height is an error", () => {
  const result = compileLevel(level([SPAWN, entity({ id: "Hazard", iid: "h1", w: 0 })]));
  const d = find(result.diagnostics, "size.positive");
  assert.equal(d?.severity, "error");
  assert.equal(d?.field, "width");
});

test("an entity wholly outside the level bounds is a warning", () => {
  const result = compileLevel(
    level([SPAWN, entity({ id: "Hazard", iid: "h1", x: COLS * GRID + 100 })]),
  );
  const d = find(result.diagnostics, "bounds");
  assert.equal(d?.severity, "warning");
  assert.equal(result.ok, true);
});

test("a camera zone with non-positive dimensions is an error", () => {
  const result = compileLevel(
    level([SPAWN, entity({ id: "CameraZone", iid: "z1", w: 200, h: 0 })]),
  );
  const d = find(result.diagnostics, "size.positive");
  assert.equal(d?.severity, "error");
  assert.equal(d?.entityId, "z1");
});

// --- loadLevel compatibility ------------------------------------------------

test("loadLevel returns the runtime on success", () => {
  const runtime = loadLevel(level([SPAWN]));
  assert.equal(runtime.spawn.x, SPAWN.x);
});

test("loadLevel throws a LevelCompileError carrying every diagnostic on failure", () => {
  assert.throws(
    () => loadLevel(level([])),
    (err: unknown) => {
      assert.ok(err instanceof LevelCompileError);
      assert.ok((err as LevelCompileError).diagnostics.some((d) => d.code === "spawn.count"));
      return true;
    },
  );
});

// --- Runtime identity -------------------------------------------------------

test("authored entity ids survive compilation and Scene creation", () => {
  const data = level([
    SPAWN,
    entity({
      id: "Enemy",
      iid: "enemy-a",
      x: 64,
      y: (ROWS - 2) * GRID,
      fields: { Kind: "metool" },
    }),
    entity({ id: "LifeCapsule", iid: "life-a", x: 96, fields: { Kind: "small" } }),
    entity({ id: "MovingPlatform", iid: "plat-a", x: 128, w: 48, h: 8 }),
    entity({ id: "CameraZone", iid: "zone-a", x: 0, y: 0, w: 192, h: 128 }),
  ]);

  const scene = Scene.create({ level: data });
  assert.equal(scene.stage.enemies[0].runtimeId, "enemy-a");
  assert.equal(scene.stage.enemies[0].sourceEntityId, "enemy-a");
  assert.equal(scene.stage.pickups[0].id, "life-a");
  assert.equal(scene.stage.platforms[0].id, "plat-a");
  assert.equal(scene.camera.allZones[0].id, "zone-a");
});
