import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { GAME_DATA } from "@mmx/engine/data";
import { requireProject } from "../src/loadProject.js";

const syntheticProject = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "synthetic-project",
);
const BUILTIN_HASH = "36e5bb6d8c3547a6";
const STARTER = [{ id: "mmx-starter", version: 1 }];

/** A copy of the synthetic fixture (no `packs`, no data/game.json), with `edit` applied. */
async function oldProject(
  edit: (dir: string, manifest: Record<string, unknown>) => Promise<void> = async () => {},
): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-pack-migration-"));
  await fs.cp(syntheticProject, dir, { recursive: true });
  const manifestPath = path.join(dir, "project.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  await edit(dir, manifest);
  await fs.writeFile(manifestPath, JSON.stringify(manifest));
  return dir;
}

async function snapshot(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const entry of await fs.readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const file = path.join(entry.parentPath, entry.name);
    files[path.relative(dir, file)] = await fs.readFile(file, "base64");
  }
  return files;
}

test("an old project gets the MMX Starter in memory, compiles to the built-in hash, and nothing is written", async () => {
  const dir = await oldProject();
  try {
    const before = await snapshot(dir);
    const project = await requireProject(dir);
    assert.deepEqual(project.manifest.packs, STARTER);
    assert.equal(project.compiledGameData.hash, BUILTIN_HASH);
    assert.deepEqual(project.gameData, GAME_DATA);
    assert.deepEqual(await snapshot(dir), before);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("an old project's own records are kept over the pack's", async () => {
  const dir = await oldProject(async (root) => {
    const metool = { ...GAME_DATA.enemies.metool, touchDamage: 7 };
    await fs.mkdir(path.join(root, "data"));
    await fs.writeFile(
      path.join(root, "data/game.json"),
      JSON.stringify({ schemaVersion: 1, enemies: { metool } }),
    );
  });
  try {
    const project = await requireProject(dir);
    assert.deepEqual(project.manifest.packs, STARTER);
    assert.equal(project.gameData.enemies.metool?.touchDamage, 7);
    assert.deepEqual(project.gameData.enemies.bat, GAME_DATA.enemies.bat);
    assert.notEqual(project.compiledGameData.hash, BUILTIN_HASH);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("a project with packs: [] stays on the base data", async () => {
  const dir = await oldProject(async (_root, manifest) => {
    manifest.packs = [];
  });
  try {
    const project = await requireProject(dir);
    assert.deepEqual(project.manifest.packs, []);
    // Before the flip the base still holds the MMX objects; nothing was merged over it.
    assert.equal(project.gameData, GAME_DATA);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
