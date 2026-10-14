import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createNodeFileSystem } from "../../src/project-io/node.js";
import {
  copyStarterProjectToDirectory,
} from "../../src/starter-template/copy.js";
import {
  exportProject,
  saveProject,
  updateLevelDocument,
} from "../../src/project-io/index.js";

test("studio cross-repo prepare exports portable project with game data", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "mmx-studio-cross-repo-"));
  const exportDir = await mkdtemp(join(tmpdir(), "mmx-studio-cross-repo-export-"));
  try {
    const created = await copyStarterProjectToDirectory(workspace, {
      id: "e2e.demo",
      name: "E2E Demo",
    });
    assert.equal(created.ok, true, JSON.stringify(created));
    if (!created.ok) return;

    const fs = createNodeFileSystem(workspace);
    let project = created.value;
    const entryLevel = project.levels.find((level) => level.id === project.manifest.entryLevelId);
    assert.ok(entryLevel);

    const level = structuredClone(entryLevel.document);
    level.decorations.push({
      id: "deco.e2e",
      assetId: "sprite.hud.x-bar",
      x: 128,
      y: 64,
      layer: "background",
      parallax: 1,
      flipX: false,
      flipY: false,
    });
    project = updateLevelDocument(project, entryLevel.id, level);

    const saved = await saveProject(fs, project);
    assert.equal(saved.ok, true, JSON.stringify(saved));
    if (!saved.ok) return;

    const destFs = createNodeFileSystem(exportDir);
    const exported = await exportProject(fs, destFs, saved.value);
    assert.equal(exported.ok, true, JSON.stringify(exported));
    if (!exported.ok) return;

    assert.ok(exported.value.exportedDataFiles.includes("game/data.json"));

    const exportedFs = createNodeFileSystem(exportDir);
    const manifest = JSON.parse(await exportedFs.readText("project.json"));
    assert.equal(manifest.id, "e2e.demo");
    assert.ok(await exportedFs.exists("game/data.json"));
    assert.ok(await exportedFs.exists("levels/level.starter.json"));
    assert.ok(await exportedFs.exists("assets/sprites/hud/x_bar.png"));
  } finally {
    await rm(workspace, { recursive: true, force: true });
    await rm(exportDir, { recursive: true, force: true });
  }
});
