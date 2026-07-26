import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SCHEMA_VERSION,
  TerrainTile,
  createLevelDocument,
  migrateDocument,
  validateDocument,
  type DecorationInstance,
  type LevelDocument,
  type LevelObjectInstance,
} from "../src/index.js";

function deco(partial: Partial<DecorationInstance> & Pick<DecorationInstance, "id">): DecorationInstance {
  return {
    assetId: "prop.crate",
    x: 16,
    y: 16,
    layer: "world-front",
    ...partial,
  };
}

test("migrateDocument upgrades v1 docs to decorations: []", () => {
  const raw = {
    schemaVersion: 1,
    id: "old",
    name: "Old",
    gridSize: 16,
    cols: 4,
    rows: 4,
    tiles: new Array(16).fill(TerrainTile.Empty),
    objects: [{ id: "spawn-1", definitionId: "spawn", x: 0, y: 0 }],
  };
  const doc = migrateDocument(raw);
  assert.equal(doc.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(doc.decorations, []);
});

test("migrateDocument preserves existing decorations when upgrading", () => {
  const raw = {
    schemaVersion: 1,
    id: "old",
    name: "Old",
    gridSize: 16,
    cols: 4,
    rows: 4,
    tiles: new Array(16).fill(TerrainTile.Empty),
    objects: [{ id: "spawn-1", definitionId: "spawn", x: 0, y: 0 }],
    decorations: [deco({ id: "d1" })],
  };
  const doc = migrateDocument(raw);
  assert.equal(doc.schemaVersion, 2);
  assert.equal(doc.decorations.length, 1);
  assert.equal(doc.decorations[0].id, "d1");
});

test("migrateDocument rejects newer schema versions", () => {
  assert.throws(() => migrateDocument({ schemaVersion: 99 }), /newer than supported/);
});

test("serialize/parse round-trip keeps decorations", () => {
  const doc = createLevelDocument();
  doc.decorations.push(
    deco({ id: "d1", flipX: true, rotation: 90, parallax: 0.5, tint: 0xff00aa }),
  );
  const json = JSON.stringify(doc);
  const back = migrateDocument(JSON.parse(json));
  assert.deepEqual(back.decorations, doc.decorations);
  assert.equal(back.schemaVersion, SCHEMA_VERSION);
});

test("createLevelDocument starts with empty decorations", () => {
  assert.deepEqual(createLevelDocument().decorations, []);
});

test("decoration validation covers asset, layer, transform, parallax, tint", () => {
  const spawn: LevelObjectInstance = { id: "s", definitionId: "spawn", x: 0, y: 0 };
  const base: LevelDocument = {
    ...createLevelDocument(),
    objects: [spawn],
    decorations: [
      deco({ id: "bad-asset", assetId: "unknown.prop" }),
      deco({ id: "bad-layer", layer: "nope" as DecorationInstance["layer"] }),
      deco({ id: "bad-xy", x: Number.NaN, y: 1 }),
      deco({ id: "bad-parallax", parallax: -1 }),
      deco({ id: "bad-tint", tint: 0x1_00_00_00 }),
    ],
  };
  const result = validateDocument(base, { knownDecorationAssetIds: ["prop.crate"] });
  const codes = new Set(result.issues.map((i) => i.code));
  assert.ok(codes.has("decoration.asset.unknown"));
  assert.ok(codes.has("decoration.layer"));
  assert.ok(codes.has("decoration.transform"));
  assert.ok(codes.has("decoration.parallax"));
  assert.ok(codes.has("decoration.tint"));
  assert.equal(result.ok, false);
});

test("duplicate ids across objects and decorations are rejected", () => {
  const spawn: LevelObjectInstance = { id: "shared", definitionId: "spawn", x: 0, y: 0 };
  const doc: LevelDocument = {
    ...createLevelDocument(),
    objects: [spawn],
    decorations: [deco({ id: "shared" })],
  };
  const result = validateDocument(doc, { knownDecorationAssetIds: ["prop.crate"] });
  assert.ok(result.issues.some((i) => i.code === "id.duplicate"));
});

test("known decoration assets validate clean", () => {
  const doc: LevelDocument = {
    ...createLevelDocument(),
    decorations: [deco({ id: "d1", tint: 0xffffff, parallax: 1 })],
  };
  const result = validateDocument(doc, { knownDecorationAssetIds: new Set(["prop.crate"]) });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
});
