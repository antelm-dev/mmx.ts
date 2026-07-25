import { test } from "node:test";
import assert from "node:assert/strict";

import { level as stage1 } from "@mmx/engine/game/levels/stage1.js";
import { level as stage2 } from "@mmx/engine/game/levels/stage2.js";
import type { LevelData } from "@mmx/engine/game/LevelData.js";
import { Tile } from "@mmx/engine/game/World.js";
import type { LevelDocument } from "../src/index.js";
import { SCHEMA_VERSION, documentToLevelData, levelDataToDocument } from "../src/index.js";

function roundTrip(data: LevelData): void {
  const doc = levelDataToDocument(data);
  const back = documentToLevelData(doc);
  assert.deepEqual(back, data, "documentToLevelData ∘ levelDataToDocument is identity");
}

test("Stage 1 round-trips through the editor document unchanged", () => {
  roundTrip(stage1);
});

test("Stage 2 round-trips through the editor document unchanged", () => {
  roundTrip(stage2);
});

test("import stamps the current schema version and preserves grid geometry", () => {
  const doc = levelDataToDocument(stage2);
  assert.equal(doc.schemaVersion, SCHEMA_VERSION);
  assert.equal(doc.cols, stage2.cols);
  assert.equal(doc.rows, stage2.rows);
  assert.equal(doc.tiles.length, stage2.cols * stage2.rows);
  assert.notEqual(doc.tiles, stage2.tiles, "tiles are copied, not shared");
});

test("enemy kind and facing survive the round trip via definition + override", () => {
  const doc = levelDataToDocument(stage1);
  const enemy = doc.objects.find((o) => o.definitionId.startsWith("enemy."));
  assert.ok(enemy, "an enemy was imported");
  assert.equal(enemy.definitionId, "enemy.metool");
  // Stage 1 metools all face left → FacesRight override is false.
  assert.equal(enemy.overrides?.FacesRight, false);
});

test("a slope object placed over empty terrain bakes into Play tiles", () => {
  // The editor stores a slope as a box + Dir, leaving `tiles` untouched; Play
  // must still collide with it, so documentToLevelData expands it into terrain.
  const doc: LevelDocument = {
    schemaVersion: SCHEMA_VERSION,
    id: "slope-test",
    name: "slope-test",
    gridSize: 16,
    cols: 8,
    rows: 8,
    tiles: new Array(64).fill(Tile.Empty),
    objects: [{ id: "s1", definitionId: "slope", x: 0, y: 0, width: 32, height: 32 }],
  };
  const data = documentToLevelData(doc);
  // A 2×2 UpRight ramp: slope tiles on the rising edge, solid fill beneath.
  assert.equal(data.tiles[1], Tile.SlopeUpRight, "top-right cell is a slope tile");
  assert.equal(data.tiles[8], Tile.SlopeUpRight, "bottom-left cell is a slope tile");
  assert.equal(data.tiles[9], Tile.Solid, "the cell under the ramp is filled solid");
  // The Slope entity is still emitted for a lossless export round-trip.
  assert.ok(data.entities.some((e) => e.id === "Slope"));
  // The editor document itself is never mutated by the conversion.
  assert.equal(doc.tiles[9], Tile.Empty);
});

test("resizable objects keep their authored dimensions", () => {
  const doc = levelDataToDocument(stage2);
  const platform = doc.objects.find((o) => o.definitionId === "platform.moving");
  assert.ok(platform);
  assert.equal(platform.width, 48);
  assert.equal(platform.height, 8);
});
