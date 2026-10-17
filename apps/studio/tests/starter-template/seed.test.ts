import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { buildProjectToDisk, requireProject } from "@mmx/build-tools";

import { exportProject, loadProject } from "../../src/project-io/index.js";
import { createNodeFileSystem } from "../../src/project-io/node.js";
import { seedStarterGameData } from "../../src/starter-template/seed.js";

const fixtureRoot = resolve(import.meta.dirname, "../project-io/fixtures/minimal-project");

/** The fixture as a new project: no game/data.json. */
async function newProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mmx-seed-"));
  await cp(fixtureRoot, root, { recursive: true });
  await rm(join(root, "game/data.json"));
  return root;
}

test("a seeded game/data.json brings its starter assets: the project and its export build", async () => {
  const root = await newProject();
  const exportRoot = await mkdtemp(join(tmpdir(), "mmx-seed-export-"));
  try {
    const seeded = await seedStarterGameData(root, "anim.player.fixture");
    assert.equal(seeded.ok, true, JSON.stringify(seeded));
    if (!seeded.ok) return;
    const ids = seeded.value.manifest.assets.map((asset) => asset.id);
    for (const id of [
      "anim.effect.lemon",
      "sprite.hud.x-bar",
      "sfx.player.jump",
      "font.ui.mega-man-x",
    ])
      assert.ok(ids.includes(id), id);
    // The starter's player is not bound, so not copied; the project's own assets stay.
    assert.ok(!ids.includes("anim.player.x"));
    for (const id of ["sprite.bg", "sprite.player.fixture", "anim.player.fixture", "sfx.jump"])
      assert.ok(ids.includes(id), id);

    await buildProjectToDisk(await requireProject(root), join(root, "out"));

    const fs = createNodeFileSystem(root);
    await rm(join(root, "out"), { recursive: true });
    const loaded = await loadProject(fs);
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;
    const exported = await exportProject(fs, createNodeFileSystem(exportRoot), loaded.value);
    assert.equal(exported.ok, true, JSON.stringify(exported));
    await buildProjectToDisk(await requireProject(exportRoot), join(exportRoot, "out"));
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(exportRoot, { recursive: true, force: true });
  }
});

test("seeding never writes over a file of the project's own", async () => {
  const root = await newProject();
  try {
    const before = await createNodeFileSystem(root).readText("project.json");
    await cp(join(root, "assets/sprites/bg.png"), join(root, "assets/sprites/hud/x_bar.png"));
    const seeded = await seedStarterGameData(root, "anim.player.fixture");
    assert.equal(seeded.ok, false);
    assert.match(JSON.stringify(seeded), /sprite\.hud\.x-bar/);
    assert.equal(await createNodeFileSystem(root).readText("project.json"), before);
    assert.equal(await createNodeFileSystem(root).exists("game/data.json"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
