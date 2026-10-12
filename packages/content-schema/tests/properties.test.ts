import { test } from "node:test";
import assert from "node:assert/strict";

import type { LevelObjectInstance, PropertyMeta } from "../src/index.js";
import {
  OBJECT_DEFINITIONS,
  SCHEMA_VERSION,
  TerrainTile,
  entityFields,
  propertyIssue,
  validateDocument,
} from "../src/index.js";

test("every editable property has exactly one default, outside the fixed fields", () => {
  for (const def of OBJECT_DEFINITIONS) {
    for (const prop of def.properties) {
      assert.ok(prop.default !== undefined, `${def.id}.${prop.key} has no default`);
      assert.ok(!(prop.key in def.fields), `${def.id}.${prop.key} is also a fixed field`);
    }
  }
});

test("a default instance of every definition validates clean", () => {
  for (const def of OBJECT_DEFINITIONS) {
    const objects: LevelObjectInstance[] = [{ id: "s", definitionId: "spawn", x: 32, y: 32 }];
    if (def.id !== "spawn") objects.push({ id: "o", definitionId: def.id, x: 16, y: 16 });
    const result = validateDocument({
      schemaVersion: SCHEMA_VERSION,
      id: "T",
      name: "T",
      gridSize: 16,
      cols: 32,
      rows: 32,
      tiles: new Array(32 * 32).fill(TerrainTile.Empty),
      objects,
      decorations: [],
    });
    assert.deepEqual(result.issues, [], def.id);
  }
});

test("entityFields resolves every property and drops undeclared overrides", () => {
  const fields = entityFields({
    id: "p",
    definitionId: "platform.moving",
    x: 0,
    y: 0,
    overrides: { Speed: 10, Kind: "bat" },
  });
  assert.deepEqual(fields, { Travel: 96, Speed: 10 });
  assert.deepEqual(entityFields({ id: "e", definitionId: "enemy.bat", x: 0, y: 0 }), {
    Kind: "bat",
    FacesRight: false,
  });
});

test("undeclared overrides warn without blocking", () => {
  const result = validateDocument({
    schemaVersion: SCHEMA_VERSION,
    id: "T",
    name: "T",
    gridSize: 16,
    cols: 8,
    rows: 8,
    tiles: new Array(64).fill(TerrainTile.Empty),
    objects: [
      { id: "s", definitionId: "spawn", x: 32, y: 32 },
      { id: "e", definitionId: "enemy.metool", x: 16, y: 16, overrides: { Kind: "bat" } },
    ],
    decorations: [],
  });
  assert.equal(result.ok, true);
  assert.ok(result.issues.some((i) => i.code === "field.unknown" && i.field === "Kind"));
});

const prop = (meta: Partial<PropertyMeta> & Pick<PropertyMeta, "type">): PropertyMeta => ({
  key: "K",
  label: "K",
  ...meta,
});

test("number and integer properties honour min, max and whole numbers", () => {
  const hp = prop({ type: "integer", min: 1, max: 32 });
  assert.equal(propertyIssue(hp, 4), undefined);
  assert.equal(propertyIssue(hp, 1.5)?.code, "field.integer");
  assert.equal(propertyIssue(hp, 0)?.code, "field.min");
  assert.equal(propertyIssue(hp, 33)?.code, "field.max");
  assert.equal(propertyIssue(hp, "4")?.code, "field.number");
  assert.equal(propertyIssue(prop({ type: "number", max: 1 }), 0.5), undefined);
});

test("string properties must be text", () => {
  assert.equal(propertyIssue(prop({ type: "string" }), "a"), undefined);
  assert.equal(propertyIssue(prop({ type: "string" }), 3)?.code, "field.string");
});

test("asset properties accept none, and check id and kind when the project assets are known", () => {
  const anim = prop({ type: "asset", assetKind: "animation" });
  const assets = new Map([
    ["walk", "animation"],
    ["boom", "sound"],
  ]);
  assert.equal(propertyIssue(anim, undefined, assets), undefined);
  assert.equal(propertyIssue(anim, "", assets), undefined);
  assert.equal(propertyIssue(anim, "walk", assets), undefined);
  assert.equal(propertyIssue(anim, "boom", assets)?.code, "field.asset");
  assert.equal(propertyIssue(anim, "missing", assets)?.code, "field.asset");
  assert.equal(propertyIssue(anim, "missing"), undefined);
  assert.equal(propertyIssue(anim, 3)?.code, "field.asset");
  const any = prop({ type: "asset" });
  assert.equal(propertyIssue(any, "boom", assets), undefined);
  assert.equal(propertyIssue(any, "missing", assets)?.code, "field.asset");
});
