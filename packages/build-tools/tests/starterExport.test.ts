import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { GAMEPLAY_SOUND_IDS } from "@mmx/browser-audio";
import {
  buildProjectToDisk,
  bundleContainsAbsolutePaths,
  bundleModuleSource,
  compileBrowserProjectBundle,
  planAssetEmission,
} from "../src/compileProject.js";
import { requireProject } from "../src/loadProject.js";
import { createStudioShapedFixture, soundAssetId } from "./helpers/createStudioShapedFixture.js";

test("studio-shaped export compiles renderer and sound bindings", async () => {
  const fixture = await createStudioShapedFixture();
  try {
    const project = await requireProject(fixture.root);
    const emission = await planAssetEmission(project);
    const bundle = await compileBrowserProjectBundle(project, emission);
    const source = bundleModuleSource(bundle);

    assert.equal(bundleContainsAbsolutePaths(source), false);
    assert.ok(bundle.rendererManifest, "renderer manifest should be built from game/data.json");
    assert.ok(bundle.rendererManifest!.playerAnims.animations.idle);
    assert.ok(bundle.soundBindings);
    assert.equal(bundle.soundBindings!.jump, soundAssetId("jump"));
    assert.ok(bundle.assetUrls[soundAssetId("jump")]);
    assert.ok(bundle.soundIds.includes(soundAssetId("jump")));
    assert.equal(bundle.soundIds.includes("jump"), false);
    assert.equal(bundle.meta.entryLevelId, "level.fixture");
    for (const runtimeName of GAMEPLAY_SOUND_IDS) {
      assert.equal(bundle.soundBindings![runtimeName], soundAssetId(runtimeName));
      assert.ok(bundle.assetUrls[soundAssetId(runtimeName)]);
    }
  } finally {
    await fixture.dispose();
  }
});

test("studio-shaped export builds deterministically to disk", async () => {
  const fixture = await createStudioShapedFixture();
  const outA = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-studio-shaped-build-a-"));
  const outB = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-studio-shaped-build-b-"));
  try {
    const project = await requireProject(fixture.root);
    const reportA = await buildProjectToDisk(project, outA);
    const reportB = await buildProjectToDisk(project, outB);
    assert.deepEqual(
      reportA.emission.assets.map((asset) => asset.contentHash),
      reportB.emission.assets.map((asset) => asset.contentHash),
    );
    assert.equal(bundleContainsAbsolutePaths(bundleModuleSource(reportA.bundle)), false);
    assert.ok(reportA.bundle.soundBindings);
    assert.ok(reportA.bundle.rendererManifest);
  } finally {
    await fs.rm(outA, { recursive: true, force: true });
    await fs.rm(outB, { recursive: true, force: true });
    await fixture.dispose();
  }
});
