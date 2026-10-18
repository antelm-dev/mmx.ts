import assert from "node:assert/strict";
import { test } from "node:test";

import { PROJECT_SCHEMA_VERSION, serializeProject } from "@mmx/project-schema";
import { createLevelDocument } from "@mmx/content-schema";

import {
  createProject,
  exportManifestForComparison,
  exportProject,
  importAsset,
  loadProject,
  mergeImportedAsset,
  normalizeRelativePath,
  PathTraversalError,
  saveProject,
} from "../../src/project-io/index.js";
import { createMemoryFileSystem } from "./memfs.js";

test("normalizeRelativePath rejects traversal and absolute paths", () => {
  assert.throws(() => normalizeRelativePath("../secret"), PathTraversalError);
  assert.throws(() => normalizeRelativePath("assets/../secret"), PathTraversalError);
  assert.throws(() => normalizeRelativePath("/abs/path"), PathTraversalError);
  assert.throws(() => normalizeRelativePath("assets\\sprites\\hero.png"), PathTraversalError);
  assert.equal(normalizeRelativePath("assets/sprites/hero.png"), "assets/sprites/hero.png");
});

test("importAsset rejects duplicate logical ids", async () => {
  const fs = createMemoryFileSystem({
    "incoming/hero.png": "png",
    "assets/sprites/hero.png": "existing",
  });

  const first = await importAsset(
    fs,
    [{ id: "sprite.hero", kind: "sprite", path: "assets/sprites/hero.png" }],
    { sourcePath: "incoming/hero.png", kind: "sprite", logicalId: "sprite.hero" },
  );
  assert.equal(first.ok, false);
  if (first.ok) return;
  assert.ok(first.issues.some((issue) => issue.code === "asset.id.collision"));
});

test("importAsset can rename on collision", async () => {
  const fs = createMemoryFileSystem({
    "incoming/hero.png": "png",
    "assets/sprites/hero.png": "existing",
  });

  const result = await importAsset(
    fs,
    [{ id: "sprite.hero", kind: "sprite", path: "assets/sprites/hero.png" }],
    {
      sourcePath: "incoming/hero.png",
      kind: "sprite",
      logicalId: "sprite.hero",
      collision: "rename",
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.asset.id, "sprite.hero.2");
  assert.ok(await fs.exists(result.value.copiedTo));
});

test("deterministic export manifest excludes orphan assets", async () => {
  const level = createLevelDocument({ name: "Intro" });
  level.decorations.push({
    id: "deco.1",
    assetId: "sprite.used",
    x: 0,
    y: 0,
    layer: "background",
    parallax: 1,
    flipX: false,
    flipY: false,
  });

  const manifest = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "demo.project",
    name: "Demo",
    gameVersion: "1.0.0",
    compatibleRuntime: { min: "1.0.0" },
    entryLevelId: "level.main",
    levels: [{ id: "level.main", path: "levels/level.main.json" }],
    assets: [
      { id: "sprite.used", kind: "sprite" as const, path: "assets/sprites/used.png" },
      { id: "sprite.orphan", kind: "sprite" as const, path: "assets/sprites/orphan.png" },
    ],
  };

  const sourceFs = createMemoryFileSystem({
    "project.json": serializeProject(manifest),
    "levels/level.main.json": JSON.stringify(level, null, 2),
    "assets/sprites/used.png": "used",
    "assets/sprites/orphan.png": "orphan",
  });

  const loaded = await loadProject(sourceFs);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;

  const destFs = createMemoryFileSystem();
  const exported = await exportProject(sourceFs, destFs, loaded.value);
  assert.equal(exported.ok, true);
  if (!exported.ok) return;

  assert.deepEqual(exported.value.excludedOrphans, ["sprite.orphan"]);
  assert.equal(exported.value.exportedAssets.length, 1);
  assert.equal(await destFs.exists("assets/sprites/orphan.png"), false);

  const first = exportManifestForComparison(loaded.value);
  const second = exportManifestForComparison(loaded.value);
  assert.equal(first, second);
  assert.equal(first, await destFs.readText("project.json"));
});

test("export fails when referenced asset file is missing", async () => {
  const manifest = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "demo.project",
    name: "Demo",
    gameVersion: "1.0.0",
    compatibleRuntime: { min: "1.0.0" },
    entryLevelId: "level.main",
    levels: [{ id: "level.main", path: "levels/level.main.json" }],
    assets: [{ id: "sprite.missing", kind: "sprite" as const, path: "assets/sprites/missing.png" }],
  };

  const level = createLevelDocument({ name: "Intro" });
  level.decorations.push({
    id: "deco.1",
    assetId: "sprite.missing",
    x: 0,
    y: 0,
    layer: "background",
    parallax: 1,
    flipX: false,
    flipY: false,
  });

  const sourceFs = createMemoryFileSystem({
    "project.json": serializeProject(manifest),
    "levels/level.main.json": JSON.stringify(level, null, 2),
  });
  const loaded = await loadProject(sourceFs);
  assert.equal(loaded.ok, false);
});

test("createProject refuses to overwrite existing manifest", async () => {
  const fs = createMemoryFileSystem({ "project.json": "{}" });
  const result = await createProject(fs, { id: "demo", name: "Demo" });
  assert.equal(result.ok, false);
});

test("mergeImportedAsset refuses silent overwrite", () => {
  const assets = [{ id: "sprite.hero", kind: "sprite" as const, path: "assets/sprites/hero.png" }];
  assert.throws(
    () =>
      mergeImportedAsset(assets, {
        id: "sprite.hero",
        kind: "sprite",
        path: "assets/sprites/other.png",
      }),
    /Refusing to merge/,
  );
});

test("create and load round-trip preserves portable paths", async () => {
  const fs = createMemoryFileSystem();
  const created = await createProject(fs, {
    id: "demo.project",
    name: "Demo",
    initialLevel: createLevelDocument({ name: "Intro" }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const loaded = await loadProject(fs);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.equal(loaded.value.manifest.id, "demo.project");
  assert.equal(loaded.value.levels[0]?.path, "levels/level.main.json");
});

test("player.loadout round-trips through save, and new projects omit it (default X)", async () => {
  const fs = createMemoryFileSystem();
  const created = await createProject(fs, { id: "loadout.project", name: "Loadout" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.value.manifest.player, undefined);
  assert.equal(JSON.parse(await fs.readText("project.json")).player, undefined);

  const zero = {
    ...created.value,
    manifest: { ...created.value.manifest, player: { loadout: "player.zero" } },
  };
  assert.equal((await saveProject(fs, zero)).ok, true);

  const loaded = await loadProject(fs);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.deepEqual(loaded.value.manifest.player, { loadout: "player.zero" });

  const destFs = createMemoryFileSystem();
  assert.equal((await exportProject(fs, destFs, loaded.value)).ok, true);
  assert.deepEqual(JSON.parse(await destFs.readText("project.json")).player, {
    loadout: "player.zero",
  });
});

test("player.loadout may name a loadout data/game.json adds, on save, load and export", async () => {
  const fs = createMemoryFileSystem();
  const created = await createProject(fs, { id: "speedy.project", name: "Speedy" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const speedy = {
    ...created.value,
    manifest: { ...created.value.manifest, player: { loadout: "player.speedy" } },
    gameData: {
      ...created.value.gameData,
      loadouts: { "player.speedy": { id: "player.speedy" } },
    } as never,
  };
  const saved = await saveProject(fs, speedy);
  assert.equal(saved.ok, true, JSON.stringify(saved.issues));

  const loaded = await loadProject(fs);
  assert.equal(loaded.ok, true, JSON.stringify(loaded.issues));
  if (!loaded.ok) return;
  assert.deepEqual(loaded.value.manifest.player, { loadout: "player.speedy" });
  assert.equal((await exportProject(fs, createMemoryFileSystem(), loaded.value)).ok, true);
});

test("a broken data/game.json is reported with the manifest issues it causes", async () => {
  const fs = createMemoryFileSystem();
  const created = await createProject(fs, { id: "speedy.project", name: "Speedy" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const manifest = { ...created.value.manifest, player: { loadout: "player.speedy" } };
  await fs.writeText("project.json", serializeProject(manifest));
  await fs.writeText("data/game.json", "{ nope");

  const loaded = await loadProject(fs);
  assert.equal(loaded.ok, false);
  const codes = loaded.issues.map((i) => [i.code, i.path]);
  assert.deepEqual(codes[0], ["game-data.parse", "/data/game.json"]);
  assert.ok(
    codes.some(([code, path]) => code === "reference.invalid" && path === "/player/loadout"),
  );
});

test("data/game.json round-trips through load and save, and export keeps its enemy sheets", async () => {
  const fs = createMemoryFileSystem();
  const created = await createProject(fs, { id: "crab.project", name: "Crab" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.deepEqual(created.value.manifest.packs, [
    { id: "mmx-starter", version: 1 },
    { id: "mmx-player-x", version: 1 },
    { id: "mmx-player-zero", version: 1 },
  ]);
  const sheet = {
    id: "anim.crab",
    kind: "animation" as const,
    path: "assets/sprites/crab.png",
    animations: {
      idle: {
        loop: true,
        speed: 1,
        frames: [{ region: [0, 0, 16, 16] as [number, number, number, number], duration: 1 }],
      },
    },
  };
  await fs.writeText(sheet.path, "png");
  const gameData = { schemaVersion: 1, enemies: { crab: { id: "crab", sheet: "anim.crab" } } };
  const withCrab = {
    ...created.value,
    manifest: { ...created.value.manifest, assets: [sheet] },
    gameData: gameData as never,
  };
  const saved = await saveProject(fs, withCrab);
  assert.equal(saved.ok, true, JSON.stringify(saved.issues));
  assert.deepEqual(JSON.parse(await fs.readText("data/game.json")), gameData);

  const loaded = await loadProject(fs);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.deepEqual(loaded.value.gameData, gameData);

  const destFs = createMemoryFileSystem();
  const exported = await exportProject(fs, destFs, loaded.value);
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  assert.deepEqual(exported.value.excludedOrphans, []);
  assert.ok(exported.value.exportedDataFiles.includes("data/game.json"));

  await fs.writeText("data/game.json", "{ nope");
  const broken = await loadProject(fs);
  assert.equal(broken.ok, false);
  assert.equal(broken.issues[0]?.code, "game-data.parse");
});

test("an unknown player.loadout is reported at /player/loadout on load and save", async () => {
  const fs = createMemoryFileSystem();
  const created = await createProject(fs, { id: "loadout.project", name: "Loadout" });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const bad = {
    ...created.value,
    manifest: { ...created.value.manifest, player: { loadout: "player.nobody" } },
  };

  const saved = await saveProject(fs, bad);
  assert.equal(saved.ok, false);
  assert.ok(
    saved.issues.some((i) => i.code === "reference.invalid" && i.path === "/player/loadout"),
  );

  await fs.writeText("project.json", serializeProject(bad.manifest));
  const loaded = await loadProject(fs);
  assert.equal(loaded.ok, false);
  assert.ok(
    loaded.issues.some((i) => i.code === "reference.invalid" && i.path === "/player/loadout"),
  );
});
