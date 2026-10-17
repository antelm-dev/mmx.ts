import { test } from "node:test";
import assert from "node:assert/strict";

import pack from "@mmx/pack-mmx-starter/data/game.json" with { type: "json" };
import { buildCompileRegistries } from "@mmx/engine/behaviors";
import {
  COMPILED_GAME_DATA,
  GAME_DATA,
  compileGameData,
  mergeGameData,
  type GameDataOverlay,
} from "@mmx/engine/data";

import { MMX_STARTER_PACK, withStarterPack } from "../src/index.js";

const STARTER = [{ id: "mmx-starter", version: 1 }];

function hashOf(overlay: GameDataOverlay | undefined): string {
  const merged = mergeGameData(GAME_DATA, overlay ?? {});
  assert.ok(merged.ok);
  const compiled = compileGameData(merged.value, buildCompileRegistries());
  assert.ok(compiled.ok);
  return compiled.value.hash;
}

test("an old project (no packs, no data/game.json) gets the whole pack and the marker", () => {
  const manifest = { id: "old" };
  const result = withStarterPack(manifest, undefined);
  assert.equal(result.changed, true);
  assert.deepEqual(result.manifest, { id: "old", packs: STARTER });
  assert.deepEqual(result.overlay, pack);
  assert.deepEqual(manifest, { id: "old" }, "the input is not mutated");
  assert.deepEqual(MMX_STARTER_PACK, STARTER[0]);
});

test("an old project keeps its records, overrides included, and gets only the missing ids", () => {
  const metool = { ...pack.enemies.metool, touchDamage: 9 };
  const crab = { ...pack.enemies.metool, id: "crab" };
  const own = {
    schemaVersion: 1,
    enemies: { metool, crab },
    prefabs: { "enemy.crab": { ...pack.prefabs["enemy.metool"], id: "enemy.crab" } },
  } as unknown as GameDataOverlay;
  const before = structuredClone(own);
  const { overlay, changed } = withStarterPack({}, own);
  assert.equal(changed, true);
  assert.deepEqual(own, before, "the input is not mutated");
  assert.equal(overlay?.enemies?.metool, metool, "the project's metool is kept");
  assert.equal(overlay?.enemies?.crab, crab);
  assert.deepEqual(overlay?.enemies?.bat, pack.enemies.bat);
  assert.deepEqual(Object.keys(overlay?.prefabs ?? {}), [
    ...Object.keys(pack.prefabs),
    "enemy.crab",
  ]);
  assert.deepEqual(overlay?.pickups, pack.pickups);
});

test("a manifest with packs is never touched: [] stays base only, a migrated project stays as is", () => {
  const own = { schemaVersion: 1, enemies: {} } as GameDataOverlay;
  for (const packs of [[], STARTER]) {
    const manifest = { packs };
    for (const overlay of [undefined, own]) {
      const result = withStarterPack(manifest, overlay);
      assert.equal(result.changed, false);
      assert.equal(result.manifest, manifest);
      assert.equal(result.overlay, overlay);
    }
  }
});

test("an overlay that is not an object of records is left unmigrated for the merge to report", () => {
  for (const bad of [[], "x", { enemies: [] }, { prefabs: 3 }]) {
    const result = withStarterPack({}, bad as unknown as GameDataOverlay);
    assert.equal(result.changed, false);
    assert.equal(result.overlay, bad);
    assert.equal(result.manifest.packs, undefined);
  }
});

test("before the flip, a migrated project compiles to the built-in hash", () => {
  assert.equal(COMPILED_GAME_DATA.hash, "36e5bb6d8c3547a6");
  assert.equal(hashOf(withStarterPack({}, undefined).overlay), "36e5bb6d8c3547a6");
  assert.equal(hashOf(withStarterPack({}, { schemaVersion: 1 }).overlay), "36e5bb6d8c3547a6");
});

test("records added from the pack are copies: mutating a result leaves the next migration intact", () => {
  const expected = structuredClone(pack);
  const first = withStarterPack({}, undefined).overlay as Record<
    string,
    Record<string, { id: string }>
  >;
  first.enemies!.metool!.id = "changed";
  delete first.pickups!["life.small"];
  assert.deepEqual(withStarterPack({}, undefined).overlay, expected);
});
