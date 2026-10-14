import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { exportProject, loadProject } from "../../src/project-io/index.js";
import { createNodeFileSystem } from "../../src/project-io/node.js";

const fixtureRoot = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "minimal-project");

test("minimal fixture loads and exports referenced assets only", async () => {
  const fs = createNodeFileSystem(fixtureRoot);
  const loaded = await loadProject(fs);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;

  const exportRoot = await mkdtemp(join(tmpdir(), "mmx-fixture-export-"));
  try {
    const destFs = createNodeFileSystem(exportRoot);
    const exported = await exportProject(fs, destFs, loaded.value);
    assert.equal(exported.ok, true, JSON.stringify(exported));
    if (!exported.ok) return;

    assert.deepEqual(exported.value.excludedOrphans, ["sfx.jump"]);
    const manifest = await destFs.readText("project.json");
    assert.match(manifest, /sprite\.bg/);
    assert.doesNotMatch(manifest, /sfx\.jump/);
    assert.equal(await destFs.exists("assets/sprites/bg.png"), true);
    assert.equal(await destFs.exists("assets/sounds/jump.wav"), false);
  } finally {
    await rm(exportRoot, { recursive: true, force: true });
  }

  const gameData = JSON.parse(await readFile(join(fixtureRoot, "game", "data.json"), "utf8"));
  assert.equal(gameData.bindings.hudSprites.xBar, "sprite.bg");
});
