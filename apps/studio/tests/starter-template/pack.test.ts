import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { requireProject } from "@mmx/build-tools";

import { copyStarterProjectToDirectory } from "../../src/starter-template/index.js";

const templates = join(dirname(fileURLToPath(import.meta.url)), "../../templates");
const packFile = join(templates, "../../../packages/pack-mmx-starter/data/game.json");
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const STARTER = [{ id: "mmx-starter", version: 1 }];

for (const name of ["mmx-starter", "mmx-demo"]) {
  test(`the ${name} template carries the MMX Starter pack and its marker`, async () => {
    assert.deepEqual(
      await readJson(join(templates, name, "data/game.json")),
      await readJson(packFile),
    );
    assert.deepEqual((await readJson(join(templates, name, "project.json"))).packs, STARTER);
  });
}

test("build-tools compiles the mmx-demo template to the former built-in hash", async () => {
  const project = await requireProject(join(templates, "mmx-demo"));
  assert.deepEqual(project.manifest.packs, STARTER);
  assert.equal(project.compiledGameData.hash, "36e5bb6d8c3547a6");
});

test("a project made from the starter template carries the pack", async () => {
  const root = await mkdtemp(join(tmpdir(), "mmx-starter-pack-copy-"));
  try {
    const created = await copyStarterProjectToDirectory(root, { id: "my.game", name: "My game" });
    assert.ok(created.ok, JSON.stringify(created.issues));
    assert.deepEqual(created.value.manifest.packs, STARTER);
    assert.deepEqual(created.value.gameData, await readJson(packFile));
    assert.deepEqual((await readJson(join(root, "project.json"))).packs, STARTER);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
