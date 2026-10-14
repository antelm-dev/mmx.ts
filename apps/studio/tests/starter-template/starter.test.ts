import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { parseProject } from "@mmx/project-schema";
import { loadProject } from "../../src/project-io/index.js";
import { createNodeFileSystem } from "../../src/project-io/node.js";

import {
  copyStarterProjectToDirectory,
  exportFreshStarterCopy,
  resolveStarterTemplateRoot,
  validateStarterTemplateOnDisk,
} from "../../src/starter-template/index.js";

test("starter manifest parses and validates", async () => {
  const result = await validateStarterTemplateOnDisk();
  assert.ok(result.manifest.assets.length > 0);
  assert.equal(result.counts.total, result.manifest.assets.length);
  assert.ok(result.counts.sprites > 0);
  assert.ok(result.counts.animations > 0);
  assert.ok(result.counts.sounds > 0);
  assert.ok(result.counts.fonts > 0);
});

test("starter game data bindings reference manifest asset ids", async () => {
  const root = resolveStarterTemplateRoot();
  const fs = createNodeFileSystem(root);
  const validation = await validateStarterTemplateOnDisk(root);
  const ids = new Set(validation.manifest.assets.map((asset) => asset.id));
  const gameData = JSON.parse(await fs.readText("game/data.json"));
  const bindings = gameData.bindings;

  for (const value of Object.values(bindings.sounds)) {
    assert.ok(ids.has(value), `missing sound binding ${value}`);
  }
  for (const value of Object.values(bindings.enemyAnimations)) {
    assert.ok(ids.has(value), `missing enemy binding ${value}`);
  }
  for (const value of Object.values(bindings.pickupAnimations)) {
    assert.ok(ids.has(value), `missing pickup binding ${value}`);
  }
  for (const value of Object.values(bindings.shotAnimations)) {
    assert.ok(ids.has(value), `missing shot binding ${value}`);
  }
  for (const value of Object.values(bindings.hudSprites)) {
    assert.ok(ids.has(value), `missing hud binding ${value}`);
  }
  assert.ok(ids.has(bindings.playerAnimation));
  assert.ok(ids.has(bindings.playerPointingSheet));
  assert.ok(ids.has(bindings.fontUi));
});

test("copyStarterProject copies template without mutating source", async () => {
  const templateRoot = resolveStarterTemplateRoot();
  const templateFs = createNodeFileSystem(templateRoot);
  const before = await templateFs.readText("project.json");

  const destRoot = await mkdtemp(join(tmpdir(), "mmx-starter-copy-"));
  try {
    const copied = await copyStarterProjectToDirectory(destRoot, {
      id: "demo.project",
      name: "Demo Project",
    });
    assert.equal(copied.ok, true, JSON.stringify(copied));
    if (!copied.ok) return;

    assert.equal(copied.value.manifest.id, "demo.project");
    assert.equal(copied.value.manifest.name, "Demo Project");
    assert.equal(await templateFs.readText("project.json"), before);

    const destFs = createNodeFileSystem(destRoot);
    const loaded = await loadProject(destFs);
    assert.equal(loaded.ok, true);
  } finally {
    await rm(destRoot, { recursive: true, force: true });
  }
});

test("exportFreshStarterCopy produces a valid portable project", async () => {
  const exportRoot = await mkdtemp(join(tmpdir(), "mmx-starter-export-"));
  try {
    const exported = await exportFreshStarterCopy(exportRoot);
    assert.equal(exported.ok, true, JSON.stringify(exported));
    if (!exported.ok) return;

    const parsed = parseProject(
      JSON.parse(await createNodeFileSystem(exportRoot).readText("project.json")),
    );
    assert.equal(parsed.ok, true);
  } finally {
    await rm(exportRoot, { recursive: true, force: true });
  }
});
