import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createLevelDocument } from "@mmx/content-schema";
import { PROJECT_SCHEMA_VERSION, serializeProject } from "@mmx/project-schema";

import { exportProject, loadProject } from "../../src/project-io/index.js";
import { createMemoryFileSystem } from "./memfs.js";

test("export copies portable game data files", async () => {
  const level = createLevelDocument({ name: "Intro" });
  const manifest = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "demo.project",
    name: "Demo",
    gameVersion: "1.0.0",
    compatibleRuntime: { min: "1.0.0" },
    entryLevelId: "level.main",
    levels: [{ id: "level.main", path: "levels/level.main.json" }],
    assets: [{ id: "sprite.used", kind: "sprite" as const, path: "assets/sprites/used.png" }],
  };

  const sourceFs = createMemoryFileSystem({
    "project.json": serializeProject(manifest),
    "levels/level.main.json": JSON.stringify(level, null, 2),
    "assets/sprites/used.png": "used",
    "game/data.json": JSON.stringify({ schemaVersion: 1, bindings: { sounds: {} } }, null, 2),
    "ATTRIBUTION.md": "Attribution",
  });

  const loaded = await loadProject(sourceFs);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;

  const destFs = createMemoryFileSystem();
  const exported = await exportProject(sourceFs, destFs, loaded.value);
  assert.equal(exported.ok, true);
  if (!exported.ok) return;

  assert.deepEqual(exported.value.exportedDataFiles.sort(), ["ATTRIBUTION.md", "game/data.json"]);
  assert.equal(await destFs.exists("game/data.json"), true);
  assert.equal(await destFs.exists("ATTRIBUTION.md"), true);
});
