import { test } from "node:test";
import assert from "node:assert/strict";

import pack from "@mmx/pack-mmx-starter/data/game.json" with { type: "json" };
import xPack from "@mmx/pack-mmx-player-x/data/game.json" with { type: "json" };
import zeroPack from "@mmx/pack-mmx-player-zero/data/game.json" with { type: "json" };
import assetsJson from "@mmx/pack-mmx-starter/assets.json" with { type: "json" };
import bindingsJson from "@mmx/pack-mmx-starter/bindings.json" with { type: "json" };
import { buildCompileRegistries } from "@mmx/engine/behaviors";
import {
  COMPILED_GAME_DATA,
  GAME_DATA,
  compileGameData,
  mergeGameData,
  type GameDataOverlay,
} from "@mmx/engine/data";

import {
  MMX_PLAYER_X,
  MMX_PLAYER_ZERO,
  MMX_STARTER_PACK,
  mergePack,
  withStarterPack,
} from "../src/index.js";

const STARTER = [{ id: "mmx-starter", version: 1 }];
const X = { id: "mmx-player-x", version: 1 };
const ZERO = { id: "mmx-player-zero", version: 1 };
const PLAYERS = [X, ZERO];

type Records = Record<string, Record<string, unknown>>;

/** Asserts `overlay` holds every record of each of `packs`, value for value. */
function assertHasRecords(overlay: GameDataOverlay | undefined, ...packs: object[]): void {
  const own = overlay as unknown as Records;
  for (const data of packs) {
    for (const [category, records] of Object.entries(data)) {
      if (category === "schemaVersion") continue;
      for (const [id, record] of Object.entries(records as Records)) {
        assert.deepEqual(own[category]?.[id], record, `${category}.${id}`);
      }
    }
  }
}

function hashOf(overlay: GameDataOverlay | undefined): string {
  const merged = mergeGameData(GAME_DATA, overlay ?? {});
  assert.ok(merged.ok);
  const compiled = compileGameData(merged.value, buildCompileRegistries());
  assert.ok(compiled.ok);
  return compiled.value.hash;
}

test("an old project (no packs, no data/game.json) gets Starter, X and Zero and their markers", () => {
  const manifest = { id: "old" };
  const result = withStarterPack(manifest, undefined);
  assert.equal(result.changed, true);
  assert.deepEqual(result.manifest, { id: "old", packs: [...STARTER, ...PLAYERS] });
  assertHasRecords(result.overlay, pack, xPack, zeroPack);
  // Starter's records first, then X's and Zero's, as the packs are listed.
  assert.deepEqual(Object.keys(result.overlay?.actors ?? {}), [
    ...Object.keys(pack.actors),
    "player.x",
    "player.zero",
  ]);
  assert.deepEqual(manifest, { id: "old" }, "the input is not mutated");
  assert.deepEqual(MMX_STARTER_PACK, STARTER[0]);
  assert.deepEqual([MMX_PLAYER_X.ref, MMX_PLAYER_ZERO.ref], PLAYERS);
  assert.equal(MMX_PLAYER_X.data, xPack);
  assert.equal(MMX_PLAYER_ZERO.data, zeroPack);
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
  // The project's records keep their order; the pack's it lacks follow.
  assert.deepEqual(Object.keys(overlay?.prefabs ?? {}), [
    "enemy.crab",
    ...Object.keys(pack.prefabs),
  ]);
  assert.deepEqual(Object.keys(overlay?.enemies ?? {}), ["metool", "crab", "bat", "pantheon"]);
  assert.deepEqual(overlay?.pickups, pack.pickups);
});

test("migration adds whole records only: a key removed from a record stays removed", () => {
  // The Enemy editor's "Shield: none" deletes the key.
  const metool = { ...pack.enemies.metool } as Record<string, unknown>;
  delete metool.shield;
  const own = { schemaVersion: 1, enemies: { metool } } as unknown as GameDataOverlay;
  const { overlay, changed } = withStarterPack({}, own);
  assert.equal(changed, true);
  assert.equal(overlay?.enemies?.metool, metool, "the same object");
  assert.equal("shield" in (overlay?.enemies?.metool ?? {}), false);
  assert.deepEqual(overlay?.enemies?.bat, pack.enemies.bat, "missing records are still added");
});

test("each missing player pack is added, its marker after the project's", () => {
  const own = structuredClone(pack) as GameDataOverlay;
  for (const [packs, added] of [
    [[...STARTER, X], [ZERO]],
    [[ZERO], [X]],
    [[{ ...X, version: 9 }, ...STARTER], [ZERO]],
  ] as const) {
    const manifest = { packs };
    const result = withStarterPack(manifest, own);
    assert.equal(result.changed, true);
    assert.deepEqual(result.manifest.packs, [...packs, ...added]);
    assert.equal(manifest.packs, packs, "the input is not mutated");
    const data = added[0] === X ? xPack : zeroPack;
    assertHasRecords(result.overlay, data);
    const other = (added[0] === X ? zeroPack : xPack) as { loadouts: object };
    for (const id of Object.keys(other.loadouts)) {
      assert.equal(result.overlay?.loadouts?.[id], undefined, `${id}: its marker is there`);
    }
  }
});

test("packs: [] stays base only, and a project with both player packs gets nothing", () => {
  const own = { schemaVersion: 1, enemies: {} } as GameDataOverlay;
  for (const packs of [[], [...STARTER, X, ZERO], [ZERO, { ...X, version: 9 }]]) {
    const manifest = { packs };
    for (const overlay of [undefined, own]) {
      const result = withStarterPack(manifest, overlay);
      assert.equal(result.changed, false);
      assert.equal(result.manifest, manifest);
      assert.equal(result.overlay, overlay);
    }
  }
});

test("a project with packs but no player pack gets X and Zero, records and markers", () => {
  const own = structuredClone(pack) as GameDataOverlay;
  for (const packs of [STARTER, [{ id: "my-pack", version: 3 }]]) {
    const manifest = { id: "p", packs };
    const result = withStarterPack(manifest, own);
    assert.equal(result.changed, true);
    assert.deepEqual(result.manifest, { id: "p", packs: [...packs, ...PLAYERS] });
    assert.equal(manifest.packs, packs, "the input is not mutated");
    assertHasRecords(result.overlay, pack, xPack, zeroPack);
  }
  // Only the players: an empty Starter project stays without the Starter's records.
  const empty = withStarterPack({ packs: STARTER }, undefined);
  assert.deepEqual(empty.manifest.packs, [...STARTER, ...PLAYERS]);
  assertHasRecords(empty.overlay, xPack, zeroPack);
  assert.equal(empty.overlay?.enemies, undefined);
});

test("player records the project has win, keep their order, and get no missing key", () => {
  const loadout = { ...xPack.loadouts["player.x"], weapons: ["buster"] };
  const walk = { ...xPack.abilities["player.walk"] } as Record<string, unknown>;
  delete walk.config;
  const own = {
    ...structuredClone(pack),
    abilities: {
      "my.dash": { ...xPack.abilities["player.dash"], id: "my.dash" },
      "player.walk": walk,
    },
    loadouts: { "player.x": loadout },
  } as unknown as GameDataOverlay;
  const before = structuredClone(own);
  const { overlay } = withStarterPack({ packs: STARTER }, own);
  assert.deepEqual(own, before, "the input is not mutated");
  assert.equal(overlay?.loadouts?.["player.x"], loadout, "the project's loadout, same object");
  assert.equal(overlay?.abilities?.["player.walk"], walk, "no key filled");
  assert.deepEqual(Object.keys(overlay?.abilities ?? {}).slice(0, 3), [
    "my.dash",
    "player.walk",
    "player.idle",
  ]);
  assert.deepEqual(Object.keys(overlay?.loadouts ?? {}), ["player.x", "player.zero"]);
  assert.equal(overlay?.enemies, own.enemies, "categories no player pack has: same object");
});

test("the migration is idempotent: a second run changes nothing", () => {
  for (const manifest of [{}, { packs: STARTER }]) {
    const first = withStarterPack(manifest, undefined);
    const second = withStarterPack(first.manifest, first.overlay);
    assert.equal(second.changed, false);
    assert.equal(second.manifest, first.manifest);
    assert.equal(second.overlay, first.overlay);
  }
});

test("an overlay that is not an object of records is left unmigrated for the merge to report", () => {
  for (const bad of [[], "x", { enemies: [] }, { prefabs: 3 }, { loadouts: [] }]) {
    const result = withStarterPack({}, bad as unknown as GameDataOverlay);
    assert.equal(result.changed, false);
    assert.equal(result.overlay, bad);
    assert.equal(result.manifest.packs, undefined);
  }
  const players = { schemaVersion: 1, abilities: 3 } as unknown as GameDataOverlay;
  const result = withStarterPack({ packs: STARTER }, players);
  assert.equal(result.changed, false);
  assert.equal(result.manifest.packs, STARTER);
});

test("a malformed packs is left for the parse to report", () => {
  for (const packs of ["x", { id: "mmx-starter" }, null, [null], [...STARTER, "x"]]) {
    const manifest = { packs } as unknown as { packs?: { id: string; version: number }[] };
    const result = withStarterPack(manifest, undefined);
    assert.equal(result.changed, false);
    assert.equal(result.manifest, manifest);
  }
});

test("a migrated project compiles to the former built-in hash, which the core alone no longer has", () => {
  assert.notEqual(COMPILED_GAME_DATA.hash, "36e5bb6d8c3547a6");
  assert.equal(hashOf(withStarterPack({}, undefined).overlay), "36e5bb6d8c3547a6");
  assert.equal(hashOf(withStarterPack({}, { schemaVersion: 1 }).overlay), "36e5bb6d8c3547a6");
  // A project made since packs: the Starter's records, then X and Zero added.
  const starter = withStarterPack({ packs: STARTER }, structuredClone(pack) as GameDataOverlay);
  assert.deepEqual(starter.manifest.packs, [...STARTER, ...PLAYERS]);
  assert.equal(hashOf(starter.overlay), "36e5bb6d8c3547a6");
});

test("records added from the pack are copies: mutating a result leaves the next migration intact", () => {
  const expected = structuredClone(withStarterPack({}, undefined).overlay);
  const first = withStarterPack({}, undefined).overlay as Record<
    string,
    Record<string, { id: string }>
  >;
  first.enemies!.metool!.id = "changed";
  first.loadouts!["player.x"]!.id = "changed";
  delete first.pickups!["life.small"];
  assert.deepEqual(withStarterPack({}, undefined).overlay, expected);
});

// Contract C-INSTALL: mergePack adds what the project lacks and never replaces anything.
type Entry = { id: string; path: string };
const ASSETS: Entry[] = assetsJson.assets;
const BINDINGS = bindingsJson;
const PACK_BINDING_KEYS = Object.entries(BINDINGS).flatMap(([group, entries]) =>
  Object.keys(entries).map((key) => `binding ${group}.${key}`),
);
const blankManifest = () => ({ id: "blank", packs: STARTER, assets: [] as Entry[] });

test("mergePack: a blank project gets the pack's records, asset entries and bindings", () => {
  const manifest = blankManifest();
  const bindingsFile = { schemaVersion: 1, bindings: { playerAnimation: "anim.player.x" } };
  const result = mergePack({ manifest, overlay: undefined, bindingsFile });
  assert.deepEqual(result.overlay, pack);
  assert.deepEqual(result.manifest.assets, ASSETS);
  assert.equal(result.manifest.packs, manifest.packs, "already at v1: kept");
  assert.deepEqual(result.bindingsFile, {
    schemaVersion: 1,
    bindings: { playerAnimation: "anim.player.x", ...BINDINGS },
  });
  assert.deepEqual(result.skipped, []);
  assert.ok(result.added.includes("record enemies.metool"));
  assert.ok(result.added.includes("asset anim.enemy.metool"));
  for (const key of PACK_BINDING_KEYS) assert.ok(result.added.includes(key), key);
  assert.deepEqual(manifest, blankManifest(), "the input is not mutated");
  assert.equal(hashOf(result.overlay), "36e5bb6d8c3547a6");

  // Without game/data.json Play uses the starter's bindings: none is written.
  const none = mergePack({ manifest, overlay: undefined });
  assert.equal(none.bindingsFile, undefined);
  assert.deepEqual(none.skipped, ["bindings: no game/data.json, Play uses the starter's"]);
});

test("mergePack: a v1 project without names gets the missing keys, its pickup keys kept", () => {
  const prefabs = structuredClone(pack.prefabs) as Record<string, Record<string, unknown>>;
  for (const prefab of Object.values(prefabs)) {
    delete prefab.name;
    delete prefab.description;
  }
  const overlay = { ...structuredClone(pack), prefabs } as unknown as GameDataOverlay;
  // Bound before pickups were keyed by sheet: small/large, plus ammo/sammo.
  const pickupAnimations = {
    large: "anim.pickup.large",
    small: "anim.pickup.small",
    ammo: "anim.pickup.ammo",
    sammo: "anim.pickup.sammo",
  };
  const bindingsFile = {
    bindings: { enemyAnimations: BINDINGS.enemyAnimations, pickupAnimations },
  };
  const result = mergePack({
    manifest: { packs: STARTER, assets: [...ASSETS] },
    overlay,
    bindingsFile,
  });
  assert.deepEqual(result.overlay, pack, "names and descriptions are back");
  assert.ok(result.added.includes("key prefabs.enemy.metool.name"));
  assert.ok(result.added.includes("key prefabs.pickup.life.small.description"));
  assert.ok(
    result.added.every((entry) => entry.startsWith("key prefabs.")),
    result.added.join(),
  );
  // heal/sheal would take over from the project's large/small: not added.
  assert.equal(result.bindingsFile, bindingsFile);
  assert.deepEqual(result.skipped, [
    "binding pickupAnimations.heal: bound by its older key 'large'",
    "binding pickupAnimations.sheal: bound by its older key 'small'",
  ]);
});

test("mergePack: a record the user modified is kept, its missing keys added, and reported", () => {
  const metool = { ...pack.enemies.metool, touchDamage: 9 } as Record<string, unknown>;
  delete metool.shield;
  const prefab = { ...pack.prefabs["enemy.metool"], name: "My Metool" };
  const overlay = {
    ...structuredClone(pack),
    enemies: { ...pack.enemies, metool },
    prefabs: { ...pack.prefabs, "enemy.metool": prefab },
  } as unknown as GameDataOverlay;
  const result = mergePack({ manifest: { packs: STARTER, assets: [...ASSETS] }, overlay });
  const merged = result.overlay?.enemies?.metool as unknown as Record<string, unknown>;
  assert.equal(merged.touchDamage, 9);
  assert.deepEqual(merged.shield, pack.enemies.metool.shield);
  assert.equal(result.overlay?.prefabs?.["enemy.metool"], prefab, "nothing missing: same object");
  assert.deepEqual(result.added, ["key enemies.metool.shield"]);
  assert.deepEqual(result.skipped, [
    "record prefabs.enemy.metool: the project's values kept",
    "record enemies.metool: the project's values kept",
    "bindings: no game/data.json, Play uses the starter's",
  ]);
});

test("mergePack keeps the project's record order and appends the pack's ids it lacks", () => {
  const own = {
    schemaVersion: 1,
    enemies: { pantheon: pack.enemies.pantheon, metool: pack.enemies.metool },
  } as unknown as GameDataOverlay;
  const result = mergePack({ manifest: { packs: STARTER }, overlay: own });
  assert.deepEqual(Object.keys(result.overlay?.enemies ?? {}), ["pantheon", "metool", "bat"]);
  assert.deepEqual(Object.keys(result.overlay?.prefabs ?? {}), Object.keys(pack.prefabs));
});

test("mergePack: a colliding asset id or occupied path is kept, a differing binding too", () => {
  const mine = { id: "sprite.enemies.metool", kind: "sprite", path: "assets/my/metool.png" };
  const result = mergePack({
    manifest: { packs: STARTER, assets: [mine] },
    overlay: structuredClone(pack) as GameDataOverlay,
    bindingsFile: { bindings: { enemyAnimations: { metool: "anim.my.metool" } } },
    occupiedPaths: new Set(["assets/sprites/pickups/heal.png"]),
  });
  const ids = result.manifest.assets.map((asset) => asset.id);
  assert.equal(result.manifest.assets[0], mine);
  assert.equal(ids.filter((id) => id === "sprite.enemies.metool").length, 1);
  assert.ok(!ids.includes("sprite.pickups.heal") && !ids.includes("anim.pickup.large"));
  assert.equal(ids.length, ASSETS.length - 2);
  assert.deepEqual(result.skipped.sort(), [
    "asset anim.pickup.large: assets/sprites/pickups/heal.png holds another file",
    "asset sprite.enemies.metool: the project's entry kept",
    "asset sprite.pickups.heal: assets/sprites/pickups/heal.png holds another file",
    "binding enemyAnimations.metool: the project's kept",
    "binding pickupAnimations.heal: anim.pickup.large is not in the project",
  ]);
  const { bindings } = result.bindingsFile as { bindings: Record<string, Record<string, string>> };
  assert.equal(bindings.enemyAnimations!.metool, "anim.my.metool");
  assert.equal(bindings.enemyAnimations!.bat, "anim.enemy.bat");
});

test("mergePack: a second run adds nothing and returns the same objects", () => {
  const first = mergePack({
    manifest: { id: "p", assets: [] as Entry[] },
    overlay: undefined,
    bindingsFile: { bindings: {} },
  });
  assert.ok(first.added.includes("pack mmx-starter v1"));
  const second = mergePack({
    manifest: first.manifest,
    overlay: first.overlay,
    bindingsFile: first.bindingsFile,
  });
  assert.deepEqual(second.added, []);
  assert.deepEqual(second.skipped, []);
  assert.equal(second.manifest, first.manifest);
  assert.equal(second.overlay, first.overlay);
  assert.equal(second.bindingsFile, first.bindingsFile);
});

test("mergePack: an older pack version is bumped, a newer one is kept", () => {
  const overlay = structuredClone(pack) as GameDataOverlay;
  const older = mergePack({ manifest: { packs: [{ id: "mmx-starter", version: 0 }] }, overlay });
  assert.deepEqual(older.manifest.packs, STARTER);
  assert.ok(older.added.includes("pack mmx-starter v0 → v1"));
  const newer = mergePack({ manifest: { packs: [{ id: "mmx-starter", version: 2 }] }, overlay });
  assert.deepEqual(newer.manifest.packs, [{ id: "mmx-starter", version: 2 }]);
  assert.ok(newer.skipped.includes("pack mmx-starter: the project has v2, newer than v1"));
});
