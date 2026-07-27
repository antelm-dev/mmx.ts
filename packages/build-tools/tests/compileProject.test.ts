import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  buildProjectToDisk,
  bundleContainsAbsolutePaths,
  bundleModuleSource,
  compileBrowserProjectBundle,
} from "../src/compileProject.js";
import { hashContent } from "../src/contentHash.js";
import { levelDocumentToLevelData } from "../src/compileLevel.js";
import { requireProject } from "../src/loadProject.js";
import { planAssetEmission } from "../src/compileProject.js";

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
  assert.ok(bundle.compiledGameData.hash.length > 0);
  assert.equal(bundle.assetUrls["sprite.bg"], emission.byId["sprite.bg"]?.publicUrl);
});

test("levelDocumentToLevelData maps spawn definition to engine entity", async () => {
  const project = await requireProject(syntheticProject);
  const level = levelDocumentToLevelData(project.levels[0]!.document);
  assert.equal(level.entities[0]?.id, "Spawn");
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
