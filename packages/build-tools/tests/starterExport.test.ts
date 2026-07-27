import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  buildProjectToDisk,
  bundleContainsAbsolutePaths,
  bundleModuleSource,
  compileBrowserProjectBundle,
  planAssetEmission,
} from "../src/compileProject.js";
import { requireProject } from "../src/loadProject.js";

test("starter-shaped export compiles renderer and sound bindings", async () => {
  const studioRoot = process.env.MMX_STUDIO_ROOT;
  if (!studioRoot) {
    return;
  }

  const templateRoot = path.join(studioRoot, "templates/mmx-starter");
  const project = await requireProject(templateRoot);
  const emission = await planAssetEmission(project);
  const bundle = await compileBrowserProjectBundle(project, emission);
  const source = bundleModuleSource(bundle);

  assert.equal(bundleContainsAbsolutePaths(source), false);
  assert.ok(bundle.rendererManifest, "renderer manifest should be built from game/data.json");
  assert.ok(bundle.rendererManifest!.playerAnims.animations.idle);
  assert.ok(bundle.soundBindings);
  assert.equal(bundle.soundBindings!.jump, "sfx.player.jump");
  assert.ok(bundle.assetUrls["sfx.player.jump"]);
  assert.ok(bundle.soundIds.includes("sfx.player.jump"));
  assert.equal(bundle.soundIds.includes("jump"), false);
  assert.equal(bundle.meta.entryLevelId, "level.starter");
});

test("starter-shaped export builds deterministically to disk", async () => {
  const studioRoot = process.env.MMX_STUDIO_ROOT;
  if (!studioRoot) return;

  const templateRoot = path.join(studioRoot, "templates/mmx-starter");
  const outA = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-starter-build-a-"));
  const outB = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-starter-build-b-"));
  try {
    const project = await requireProject(templateRoot);
    const reportA = await buildProjectToDisk(project, outA);
    const reportB = await buildProjectToDisk(project, outB);
    assert.deepEqual(
      reportA.emission.assets.map((asset) => asset.contentHash),
      reportB.emission.assets.map((asset) => asset.contentHash),
    );
    assert.equal(bundleContainsAbsolutePaths(bundleModuleSource(reportA.bundle)), false);
  } finally {
    await fs.rm(outA, { recursive: true, force: true });
    await fs.rm(outB, { recursive: true, force: true });
  }
});
