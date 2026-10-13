import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { Tile, type LevelData } from "@mmx/engine";
import { SCHEMA_VERSION, TerrainTile, type LevelDocument } from "@mmx/content-schema";
import {
  documentToLevelData,
  instanceToEntity,
  levelDataToDocument,
} from "../../src/editor-runtime/adapters/index.js";

function readDemoDocument(name: string): LevelDocument {
  return JSON.parse(
    readFileSync(new URL(`../../templates/mmx-demo/levels/${name}.json`, import.meta.url), "utf8"),
  ) as LevelDocument;
}

const stage1Document = readDemoDocument("level.stage-1");
const stage2Document = readDemoDocument("level.mechanics-demo");
const stage1 = documentToLevelData(stage1Document);
const stage2 = documentToLevelData(stage2Document);

function roundTrip(data: LevelData): void {
  const doc = levelDataToDocument(data);
  const back = documentToLevelData(doc);
  assert.deepEqual(back, data, "documentToLevelData ∘ levelDataToDocument is identity");
}

test("demo Stage 1 round-trips through the editor document unchanged", () => {
  roundTrip(stage1);
});

test("demo mechanics level round-trips through the editor document unchanged", () => {
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
  assert.equal(enemy.overrides?.FacesRight, false);
});

test("a slope object placed over empty terrain bakes into Play tiles", () => {
  const doc: LevelDocument = {
    schemaVersion: SCHEMA_VERSION,
    id: "slope-test",
    name: "slope-test",
    gridSize: 16,
    cols: 8,
    rows: 8,
    tiles: new Array(64).fill(TerrainTile.Empty),
    objects: [{ id: "s1", definitionId: "slope", x: 0, y: 0, width: 32, height: 32 }],
    decorations: [],
  };
  const data = documentToLevelData(doc);
  assert.equal(data.tiles[1], Tile.SlopeUpRight, "top-right cell is a slope tile");
  assert.equal(data.tiles[8], Tile.SlopeUpRight, "bottom-left cell is a slope tile");
  assert.equal(data.tiles[9], Tile.Solid, "the cell under the ramp is filled solid");
  assert.ok(data.entities.some((e) => e.id === "Slope"));
  assert.equal(doc.tiles[9], TerrainTile.Empty);
});

test("resizable objects keep their authored dimensions", () => {
  const doc = levelDataToDocument(stage2);
  const platform = doc.objects.find((o) => o.definitionId === "platform.moving");
  assert.ok(platform);
  assert.equal(platform.width, 48);
  assert.equal(platform.height, 8);
});

test("decorations never become engine entities", () => {
  const doc: LevelDocument = {
    schemaVersion: SCHEMA_VERSION,
    id: "deco-test",
    name: "deco-test",
    gridSize: 16,
    cols: 8,
    rows: 8,
    tiles: new Array(64).fill(TerrainTile.Empty),
    objects: [{ id: "spawn-1", definitionId: "spawn", x: 16, y: 16 }],
    decorations: [
      {
        id: "d1",
        assetId: "prop.crate",
        x: 48,
        y: 48,
        layer: "foreground",
      },
    ],
  };
  const data = documentToLevelData(doc);
  assert.equal(data.entities.length, 1);
  assert.equal(data.entities[0].id, "Spawn");
  assert.ok(!("decorations" in data));
});

test("levelDataToDocument starts with empty decorations", () => {
  const doc = levelDataToDocument(stage1);
  assert.deepEqual(doc.decorations, []);
});

test("an instance compiles every property, defaults included, and drops undeclared overrides", () => {
  const entity = instanceToEntity({
    id: "p",
    definitionId: "platform.moving",
    x: 0,
    y: 0,
    overrides: { Speed: 10, Kind: "bat" },
  });
  assert.deepEqual(entity.fields, { Travel: 96, Speed: 10, Axis: "horizontal" });
});

test("falling platforms and every built-in enemy kind import as their own definitions", () => {
  const doc: LevelDocument = {
    ...stage1Document,
    objects: [
      { id: "f", definitionId: "platform.falling", x: 32, y: 64, width: 32, height: 8, overrides: { Delay: 1 } },
      { id: "p", definitionId: "enemy.pantheon", x: 96, y: 64 },
    ],
  };
  const back = levelDataToDocument(documentToLevelData(doc));
  assert.deepEqual(
    back.objects.map((o) => o.definitionId),
    ["platform.falling", "enemy.pantheon"],
  );
  roundTrip(documentToLevelData(doc));
});
