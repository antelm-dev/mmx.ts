import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createLevelDocument } from "@mmx/content-schema";
import { PROJECT_SCHEMA_VERSION, serializeProject } from "@mmx/project-schema";

import { createNodeFileSystem } from "../../src/project-io/node.js";
import {
  createProject,
  exportProject,
  loadProject,
} from "../../src/project-io/index.js";

async function writeTextFile(path: string, content: string) {
  const { writeFile, mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

test("node filesystem rejects traversal paths", () => {
  const fs = createNodeFileSystem(tmpdir());
  assert.rejects(() => fs.readText("../outside.txt"), /Rejected path traversal/);
});

test("fixture export layout is portable", async () => {
  const root = await mkdtemp(join(tmpdir(), "mmx-project-io-fixture-"));
  try {
    const fs = createNodeFileSystem(root);
    const level = createLevelDocument({ name: "Fixture" });
    level.decorations.push({
      id: "deco.bg",
      assetId: "sprite.bg",
      x: 0,
      y: 0,
      layer: "background",
      parallax: 1,
      flipX: false,
      flipY: false,
    });

    const created = await createProject(fs, {
      id: "fixture.project",
      name: "Fixture",
      initialLevel: level,
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    await writeTextFile(join(root, "assets/sprites/bg.png"), "png-bytes");
    const manifest = {
      ...created.value.manifest,
      assets: [{ id: "sprite.bg", kind: "sprite" as const, path: "assets/sprites/bg.png" }],
    };
    await writeTextFile(join(root, "project.json"), serializeProject(manifest));

    const loaded = await loadProject(fs);
    assert.equal(loaded.ok, true);
    if (!loaded.ok) return;

    const exportRoot = await mkdtemp(join(tmpdir(), "mmx-project-io-export-"));
    try {
      const destFs = createNodeFileSystem(exportRoot);
      const exported = await exportProject(fs, destFs, loaded.value);
      assert.equal(exported.ok, true);
      if (!exported.ok) return;

      const manifestText = await readFile(join(exportRoot, "project.json"), "utf8");
      assert.match(manifestText, /"id": "fixture.project"/);
      assert.match(manifestText, /assets\/sprites\/bg\.png/);
      assert.equal(await destFs.exists("levels/level.main.json"), true);
    } finally {
      await rm(exportRoot, { recursive: true, force: true });
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
