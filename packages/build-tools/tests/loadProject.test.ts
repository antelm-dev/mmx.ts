import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { setProjectDefinitions } from "@mmx/content-schema";
import pack from "@mmx/pack-mmx-starter/data/game.json" with { type: "json" };
import { levelDocumentToLevelData } from "../src/compileLevel.js";
import { loadProject, requireProject } from "../src/loadProject.js";
import { resolveProjectPath } from "../src/paths.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const syntheticProject = path.join(fixturesDir, "synthetic-project");

test("loadProject validates and loads the synthetic fixture", async () => {
  const result = await loadProject(syntheticProject);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.manifest.id, "fixture.synthetic");
  assert.equal(result.value.levels.length, 1);
  assert.equal(result.value.levels[0]?.document.objects.length, 1);
});

test("loadProject rejects path traversal in manifest asset paths", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-project-"));
  try {
    await fs.writeFile(
      path.join(dir, "project.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "bad.project",
        name: "Bad",
        gameVersion: "1.0.0",
        compatibleRuntime: { min: "1.0.0" },
        entryLevelId: "level.main",
        levels: [{ id: "level.main", path: "levels/level.main.json" }],
        assets: [{ id: "evil", kind: "image", path: "../outside.png" }],
      }),
      "utf8",
    );
    const result = await loadProject(dir);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === "path.traversal"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("resolveProjectPath rejects filesystem traversal attempts", () => {
  assert.throws(
    () => resolveProjectPath(syntheticProject, "../package.json"),
    /portable relative path/,
  );
});

test("loadProject fails when a referenced asset file is missing", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-project-"));
  try {
    const project = await requireProject(syntheticProject);
    await fs.mkdir(path.join(dir, "levels"), { recursive: true });
    await fs.writeFile(path.join(dir, "project.json"), JSON.stringify(project.manifest), "utf8");
    await fs.writeFile(
      path.join(dir, "levels/level.main.json"),
      JSON.stringify(project.levels[0]!.document),
      "utf8",
    );
    const result = await loadProject(dir);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === "asset.missing"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("loadProject rejects invalid asset kind at schema validation", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-project-"));
  try {
    const project = await requireProject(syntheticProject);
    const manifest = structuredClone(project.manifest) as Record<string, unknown>;
    manifest.assets = (project.manifest.assets as unknown[]).map((asset) => {
      const entry = { ...(asset as Record<string, unknown>) };
      if (entry.id === "sfx.jump") entry.kind = "texture";
      return entry;
    });
    await fs.writeFile(path.join(dir, "project.json"), JSON.stringify(manifest), "utf8");
    const result = await loadProject(dir);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === "asset.kind"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

async function writeImageLayerProject(dir: string, imageLayers: unknown[]): Promise<void> {
  const project = await requireProject(syntheticProject);
  const manifest = structuredClone(project.manifest);
  manifest.assets = [
    ...manifest.assets,
    { id: "image.stage", kind: "image", path: "assets/sprites/bg.png" },
  ];
  await fs.mkdir(path.join(dir, "levels"), { recursive: true });
  await fs.cp(path.join(syntheticProject, "assets"), path.join(dir, "assets"), { recursive: true });
  await fs.writeFile(path.join(dir, "project.json"), JSON.stringify(manifest), "utf8");
  await fs.writeFile(
    path.join(dir, "levels/level.main.json"),
    JSON.stringify({ ...project.levels[0]!.document, imageLayers, backdrop: "#3a1c5c" }),
    "utf8",
  );
}

const stageLayer = { id: "img.stage", x: 0, y: 0, parallax: 1, layer: "world-back" };

test("loadProject accepts image layers that reference image assets", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-project-"));
  try {
    await writeImageLayerProject(dir, [{ ...stageLayer, assetId: "image.stage" }]);
    const result = await loadProject(dir);
    assert.equal(result.ok, true, JSON.stringify(result.issues));
    if (!result.ok) return;
    const document = result.value.levels[0]!.document;
    assert.equal(document.imageLayers?.[0]?.assetId, "image.stage");
    assert.equal(document.backdrop, "#3a1c5c");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("loadProject rejects image layers whose asset is not of kind image", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-project-"));
  try {
    await writeImageLayerProject(dir, [
      { ...stageLayer, assetId: "sprite.bg" },
      { ...stageLayer, id: "img.missing", assetId: "image.nope" },
    ]);
    const result = await loadProject(dir);
    assert.equal(result.ok, false);
    const unknown = result.issues.filter((issue) => issue.code === "imageLayer.asset.unknown");
    assert.equal(unknown.length, 2);
    assert.equal(unknown[0]?.path, "levels/level.main.json");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

/** A PNG signature plus IHDR width/height: all project loading reads from a tileset image. */
function syntheticPngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

async function writeTileLayerProject(
  dir: string,
  tileset: Record<string, unknown>,
  cells: (cols: number, rows: number) => number[],
): Promise<void> {
  const project = await requireProject(syntheticProject);
  const manifest = structuredClone(project.manifest);
  manifest.assets = [
    ...manifest.assets,
    { id: "tiles.stage", kind: "tileset", path: "assets/tiles.png", ...tileset } as never,
  ];
  await fs.mkdir(path.join(dir, "levels"), { recursive: true });
  await fs.cp(path.join(syntheticProject, "assets"), path.join(dir, "assets"), { recursive: true });
  // 4×2 tiles of 16 px.
  await fs.writeFile(path.join(dir, "assets/tiles.png"), syntheticPngHeader(64, 32));
  await fs.writeFile(path.join(dir, "project.json"), JSON.stringify(manifest), "utf8");
  const document = project.levels[0]!.document;
  const tileLayers = [
    {
      id: "tiles.ground",
      tilesetId: "tiles.stage",
      layer: "world-back",
      parallax: 1,
      cells: cells(document.cols, document.rows),
    },
  ];
  await fs.writeFile(
    path.join(dir, "levels/level.main.json"),
    JSON.stringify({ ...document, tileLayers }),
    "utf8",
  );
}

const tileset = { tileSize: 16, collision: { 0: 1, 1: 2 } };

test("loadProject accepts tile layers within the tileset and rejects bad ones", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-project-"));
  try {
    const filled = (last: number) => (cols: number, rows: number) => {
      const cells = new Array<number>(cols * rows).fill(-1);
      cells[cells.length - 1] = last;
      return cells;
    };
    await writeTileLayerProject(dir, tileset, filled(7));
    const ok = await loadProject(dir);
    assert.equal(ok.ok, true, JSON.stringify(ok.issues));

    // 4×2 tiles: index 8 is past the image.
    await writeTileLayerProject(dir, tileset, filled(8));
    let result = await loadProject(dir);
    assert.ok(!result.ok && result.issues.some((i) => i.code === "tileLayer.cells.index"));

    // `columns` narrower than the image shrinks the tile count to 2×2.
    await writeTileLayerProject(dir, { ...tileset, columns: 2 }, filled(4));
    result = await loadProject(dir);
    assert.ok(!result.ok && result.issues.some((i) => i.code === "tileLayer.cells.index"));

    await writeTileLayerProject(dir, tileset, (cols, rows) => new Array(cols * rows - 1).fill(0));
    result = await loadProject(dir);
    assert.ok(!result.ok && result.issues.some((i) => i.code === "tileLayer.cells.length"));

    // Collision values must be TerrainTile values.
    await writeTileLayerProject(dir, { ...tileset, collision: { 0: 99 } }, filled(0));
    result = await loadProject(dir);
    assert.ok(!result.ok && result.issues.some((i) => i.code === "tileset.collision"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("loadProject rejects tile layers whose tilesetId is not a tileset asset", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-project-"));
  try {
    await writeTileLayerProject(dir, tileset, (cols, rows) => new Array(cols * rows).fill(-1));
    const levelPath = path.join(dir, "levels/level.main.json");
    const level = JSON.parse(await fs.readFile(levelPath, "utf8"));
    level.tileLayers[0].tilesetId = "sprite.bg";
    await fs.writeFile(levelPath, JSON.stringify(level), "utf8");
    const result = await loadProject(dir);
    assert.ok(!result.ok && result.issues.some((i) => i.code === "tileLayer.tileset.unknown"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("loadProject reports unreadable and non-PNG tileset images instead of crashing", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-project-"));
  try {
    await writeTileLayerProject(dir, tileset, (cols, rows) => new Array(cols * rows).fill(99));
    const tilesPath = path.join(dir, "assets/tiles.png");

    // Not a PNG: loads, with a warning, and indices go unchecked.
    await fs.writeFile(tilesPath, "not a png");
    const unknown = await loadProject(dir);
    assert.equal(unknown.ok, true, JSON.stringify(unknown.issues));
    const warning = unknown.issues.find((i) => i.code === "tileset.size.unknown");
    assert.equal(warning?.severity, "warning");
    assert.match(warning!.message, /tileset image size unknown; tile indices not checked/);

    // A directory: an `asset.unreadable` error, not a thrown EISDIR.
    await fs.rm(tilesPath);
    await fs.mkdir(tilesPath);
    const unreadable = await loadProject(dir);
    assert.equal(unreadable.ok, false);
    const error = unreadable.issues.find((i) => i.code === "asset.unreadable");
    assert.equal(error?.severity, "error");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("loadProject registers project object definitions before checking levels", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-project-"));
  try {
    await fs.cp(syntheticProject, dir, { recursive: true });
    // obj.fast derives from the MMX Starter pack's moving platform, which the project carries.
    await fs.mkdir(path.join(dir, "data"), { recursive: true });
    await fs.writeFile(path.join(dir, "data/game.json"), JSON.stringify(pack), "utf8");
    const manifestPath = path.join(dir, "project.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
    const levelPath = path.join(dir, "levels/level.main.json");
    const level = JSON.parse(await fs.readFile(levelPath, "utf8"));
    level.objects.push({ id: "fast.1", definitionId: "obj.fast", x: 64, y: 96 });
    await fs.writeFile(levelPath, JSON.stringify(level), "utf8");

    const fast = {
      id: "obj.fast",
      name: "Fast",
      base: "platform.moving",
      values: { Speed: 120 },
      exposed: ["Travel"],
    };
    await fs.writeFile(manifestPath, JSON.stringify({ ...manifest, objects: [fast] }), "utf8");
    const result = await loadProject(dir);
    assert.equal(result.ok, true, JSON.stringify(result.issues));
    if (!result.ok) return;
    const entity = levelDocumentToLevelData(result.value.levels[0]!.document).entities.at(-1);
    assert.equal(entity?.id, "MovingPlatform");
    assert.deepEqual(entity?.fields, { Speed: 120, Axis: "horizontal", Travel: 96 });

    await fs.writeFile(
      manifestPath,
      JSON.stringify({ ...manifest, objects: [{ ...fast, base: "nope" }] }),
      "utf8",
    );
    const bad = await loadProject(dir);
    assert.equal(bad.ok, false);
    assert.ok(bad.issues.some((i) => i.code === "object.base" && i.path === "/objects/0/base"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
    setProjectDefinitions([]);
  }
});
