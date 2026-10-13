import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { compileLevel } from "@mmx/engine";
import { GAME_DATA } from "@mmx/engine/data";
import {
  buildProjectToDisk,
  bundleContainsAbsolutePaths,
  bundleModuleSource,
  compileBrowserProjectBundle,
} from "../src/compileProject.js";
import { hashContent } from "../src/contentHash.js";
import { levelDocumentToLevelData } from "../src/compileLevel.js";
import { loadProject, requireProject } from "../src/loadProject.js";
import { planAssetEmission } from "../src/compileProject.js";
import { createStudioShapedFixture } from "./helpers/createStudioShapedFixture.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const syntheticProject = path.join(fixturesDir, "synthetic-project");

test("planAssetEmission produces content-hashed filenames", async () => {
  const project = await requireProject(syntheticProject);
  const emission = await planAssetEmission(project);
  assert.equal(emission.assets.length, 2);
  for (const asset of emission.assets) {
    assert.match(asset.fileName, /^[0-9a-f]{16}\.[a-z0-9]+$/);
    assert.equal(asset.publicUrl, `/assets/${asset.fileName}`);
    assert.equal(emission.byId[asset.assetId]?.fileName, asset.fileName);
  }
});

test("hashContent changes when asset bytes change", async () => {
  const bytes = await fs.readFile(path.join(syntheticProject, "assets/sprites/bg.png"));
  const hashA = hashContent(new Uint8Array(bytes));
  const hashB = hashContent(new Uint8Array([...bytes, 0]));
  assert.notEqual(hashA, hashB);
});

test("compileBrowserProjectBundle injects engine data without absolute paths", async () => {
  const project = await requireProject(syntheticProject);
  const emission = await planAssetEmission(project);
  const bundle = await compileBrowserProjectBundle(project, emission);
  const source = bundleModuleSource(bundle);
  assert.equal(bundleContainsAbsolutePaths(source), false);
  assert.equal(bundle.meta.entryLevelId, "level.main");
  assert.equal(bundle.levels[0]?.data.identifier, "level.main");
  assert.deepEqual(bundle.gameData, GAME_DATA);
  assert.equal(bundle.assetUrls["sprite.bg"], emission.byId["sprite.bg"]?.publicUrl);
});

test("compileBrowserProjectBundle carries project.json player.loadout into meta", async () => {
  const project = await requireProject(syntheticProject);
  const emission = await planAssetEmission(project);
  assert.equal(
    (await compileBrowserProjectBundle(project, emission)).meta.playerLoadout,
    undefined,
  );
  project.manifest.player = { loadout: "player.zero" };
  const bundle = await compileBrowserProjectBundle(project, emission);
  assert.equal(bundle.meta.playerLoadout, "player.zero");
});

test("levelDocumentToLevelData maps spawn definition to engine entity", async () => {
  const project = await requireProject(syntheticProject);
  const level = levelDocumentToLevelData(project.levels[0]!.document);
  assert.equal(level.entities[0]?.id, "Spawn");
});

test("levelDocumentToLevelData ignores presentation-only image layers, tile layers and backdrop", async () => {
  const project = await requireProject(syntheticProject);
  const document = project.levels[0]!.document;
  const withLayers = {
    ...document,
    imageLayers: [
      { id: "img", assetId: "image.stage", x: 0, y: 0, parallax: 1, layer: "world-back" as const },
    ],
    tileLayers: [
      {
        id: "tiles",
        tilesetId: "tiles.stage",
        layer: "world-back" as const,
        parallax: 1,
        cells: new Array<number>(document.cols * document.rows).fill(0),
      },
    ],
    backdrop: "#3a1c5c",
  };
  assert.deepEqual(levelDocumentToLevelData(withLayers), levelDocumentToLevelData(document));
});

test("repeated disk builds are deterministic for synthetic fixture", async () => {
  const outA = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-build-a-"));
  const outB = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-build-b-"));
  try {
    const project = await requireProject(syntheticProject);
    const reportA = await buildProjectToDisk(project, outA);
    const reportB = await buildProjectToDisk(project, outB);
    assert.deepEqual(reportA.assetFiles, reportB.assetFiles);
    assert.deepEqual(
      reportA.emission.assets.map((asset) => asset.fileName),
      reportB.emission.assets.map((asset) => asset.fileName),
    );
    assert.deepEqual(
      reportA.emission.assets.map((asset) => asset.contentHash),
      reportB.emission.assets.map((asset) => asset.contentHash),
    );
    for (const file of reportA.assetFiles) {
      const a = await fs.readFile(path.join(outA, file));
      const b = await fs.readFile(path.join(outB, file));
      assert.deepEqual(a, b);
    }
  } finally {
    await fs.rm(outA, { recursive: true, force: true });
    await fs.rm(outB, { recursive: true, force: true });
  }
});

test("browser bundle carries level image layers, backdrop and their resolved sheet URLs", async () => {
  const fixture = await createStudioShapedFixture("mmx-image-layers-");
  try {
    const manifestPath = path.join(fixture.root, "project.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    manifest.assets.push({ id: "image.stage", kind: "image", path: "assets/stage.png" });
    await fs.writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    await fs.copyFile(
      path.join(fixture.root, "assets/sprites/hud.png"),
      path.join(fixture.root, "assets/stage.png"),
    );
    const levelPath = path.join(fixture.root, "levels/level.fixture.json");
    const level = JSON.parse(await fs.readFile(levelPath, "utf8"));
    const imageLayers = [
      { id: "img.stage", assetId: "image.stage", x: 0, y: 0, parallax: 1, layer: "world-back" },
    ];
    await fs.writeFile(
      levelPath,
      JSON.stringify({ ...level, imageLayers, backdrop: "#3a1c5c" }),
      "utf8",
    );

    const project = await requireProject(fixture.root);
    const emission = await planAssetEmission(project);
    const bundle = await compileBrowserProjectBundle(project, emission);

    assert.deepEqual(bundle.levels[0]?.imageLayers, imageLayers);
    assert.equal(bundle.levels[0]?.backdrop, "#3a1c5c");
    assert.equal(
      bundle.rendererManifest?.sheetUrls["image.stage"],
      emission.byId["image.stage"]?.publicUrl,
    );
  } finally {
    await fixture.dispose();
  }
});

test("browser bundle carries tile layers, tileset geometry and the tileset sheet URL", async () => {
  const fixture = await createStudioShapedFixture("mmx-tile-layers-");
  try {
    const manifestPath = path.join(fixture.root, "project.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    manifest.assets.push(
      { id: "tiles.stage", kind: "tileset", path: "assets/tiles.png", tileSize: 16, collision: {} },
      { id: "tiles.unused", kind: "tileset", path: "assets/tiles.png", tileSize: 8, collision: {} },
    );
    await fs.writeFile(manifestPath, JSON.stringify(manifest), "utf8");
    await fs.copyFile(
      path.join(fixture.root, "assets/sprites/hud.png"),
      path.join(fixture.root, "assets/tiles.png"),
    );
    const levelPath = path.join(fixture.root, "levels/level.fixture.json");
    const level = JSON.parse(await fs.readFile(levelPath, "utf8"));
    const tileLayers = [
      {
        id: "tiles.ground",
        tilesetId: "tiles.stage",
        layer: "world-back",
        parallax: 1,
        cells: new Array<number>(level.cols * level.rows).fill(-1),
      },
    ];
    await fs.writeFile(levelPath, JSON.stringify({ ...level, tileLayers }), "utf8");

    const project = await requireProject(fixture.root);
    const emission = await planAssetEmission(project);
    const bundle = await compileBrowserProjectBundle(project, emission);

    assert.deepEqual(bundle.levels[0]?.tileLayers, tileLayers);
    assert.equal(bundle.levels[0]?.cols, level.cols);
    assert.deepEqual(bundle.levels[0]?.tilesets, { "tiles.stage": { tileSize: 16 } });
    assert.equal(
      bundle.rendererManifest?.sheetUrls["tiles.stage"],
      emission.byId["tiles.stage"]?.publicUrl,
    );
  } finally {
    await fixture.dispose();
  }
});

/** The studio-shaped fixture plus an animation asset `anim.enemy.crab` and a `data/game.json`. */
async function createOverlayFixture(overlay: unknown) {
  const fixture = await createStudioShapedFixture("mmx-game-data-overlay-");
  const manifestPath = path.join(fixture.root, "project.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.assets.push({
    id: "anim.enemy.crab",
    kind: "animation",
    path: "assets/sprites/enemy.png",
    sheetAssetId: "sprite.fixture.enemy",
    animations: {
      defense: { loop: true, speed: 1, frames: [{ region: [0, 0, 16, 16], duration: 0.1 }] },
    },
  });
  await fs.writeFile(manifestPath, JSON.stringify(manifest), "utf8");
  await fs.mkdir(path.join(fixture.root, "data"), { recursive: true });
  await fs.writeFile(path.join(fixture.root, "data/game.json"), JSON.stringify(overlay), "utf8");
  return fixture;
}

const crab = { ...GAME_DATA.enemies.metool!, id: "crab", sheet: "anim.enemy.crab" };

test("a data/game.json overlay adds a project enemy to the bundle and auto-binds its sheet", async () => {
  const fixture = await createOverlayFixture({ schemaVersion: 1, enemies: { crab } });
  try {
    const project = await requireProject(fixture.root);
    assert.ok(project.compiledGameData.enemies.has("crab"));
    assert.deepEqual(project.gameData.enemies.metool, GAME_DATA.enemies.metool);

    const emission = await planAssetEmission(project);
    const bundle = await compileBrowserProjectBundle(project, emission);
    assert.deepEqual(bundle.gameData.enemies.crab, crab);
    assert.equal(bundle.rendererBindings?.enemyActors["anim.enemy.crab"], "anim.enemy.crab");
    // Explicit bindings still win and are kept.
    assert.equal(bundle.rendererBindings?.enemyActors.metool, "anim.fixture.enemy");
    const actor = bundle.rendererManifest?.enemyActors["anim.enemy.crab"];
    assert.ok(actor);
    assert.equal(actor.sheet, "sprite.fixture.enemy");

    const source = bundleModuleSource(bundle);
    const parsed = JSON.parse(source.replace(/^export default /, "").replace(/;\s*$/, ""));
    assert.deepEqual(parsed.gameData, bundle.gameData);
    assert.deepEqual(parsed.gameData.enemies.crab, crab);
  } finally {
    await fixture.dispose();
  }
});

test("a level can place the enemy.crab prefab a data/game.json overlay adds", async () => {
  const fixture = await createOverlayFixture({
    enemies: { crab },
    prefabs: {
      "enemy.crab": {
        ...GAME_DATA.prefabs["enemy.metool"],
        id: "enemy.crab",
        source: { kind: "enemy", ref: "crab" },
      },
    },
  });
  try {
    const levelPath = path.join(fixture.root, "levels/level.fixture.json");
    const level = JSON.parse(await fs.readFile(levelPath, "utf8"));
    level.objects.push({ id: "crab.1", definitionId: "enemy.crab", x: 64, y: 32 });
    await fs.writeFile(levelPath, JSON.stringify(level), "utf8");

    const project = await requireProject(fixture.root);
    const data = levelDocumentToLevelData(project.levels[0]!.document);
    const enemy = data.entities.find((entity) => entity.id === "Enemy");
    assert.deepEqual(enemy?.fields, { Kind: "crab", FacesRight: false });
    assert.equal(compileLevel(data, project.compiledGameData).ok, true);
  } finally {
    await fixture.dispose();
    await requireProject(syntheticProject); // restore the default catalog
  }
});

test("an invalid data/game.json overlay fails loadProject with the compile diagnostic", async () => {
  const fixture = await createOverlayFixture({
    enemies: { crab: { ...crab, abilities: ["Patrol", "Teleport"] } },
  });
  try {
    const result = await loadProject(fixture.root);
    assert.equal(result.ok, false);
    const issue = result.issues.find((entry) => entry.path === "/data/game.json");
    assert.ok(issue);
    assert.equal(issue.severity, "error");
    assert.match(issue.message, /Teleport/);
  } finally {
    await fixture.dispose();
  }
});

test("a data/game.json overlay with an unsupported category fails loadProject", async () => {
  const fixture = await createOverlayFixture({ pickups: {} });
  try {
    const result = await loadProject(fixture.root);
    assert.equal(result.ok, false);
    assert.deepEqual(
      result.issues.map((entry) => [entry.code, entry.path]),
      [["overlay.category", "/data/game.json"]],
    );
  } finally {
    await fixture.dispose();
  }
});

test("a malformed data/game.json record fails loadProject instead of throwing", async () => {
  const fixture = await createOverlayFixture({ enemies: { crab: { id: "crab" } } });
  try {
    const result = await loadProject(fixture.root);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((entry) => entry.path === "/data/game.json"));
  } finally {
    await fixture.dispose();
  }
});
