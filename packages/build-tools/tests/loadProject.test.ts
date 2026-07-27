import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
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
