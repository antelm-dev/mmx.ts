import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  createProject,
  exportProject,
  loadProject,
  saveProject,
} from "../../src/project-io/index.js";
import { createNodeFileSystem } from "../../src/project-io/node.js";
import { createMemoryFileSystem } from "./memfs.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureRoot = join(here, "fixtures", "minimal-project");
const PACK = JSON.parse(
  readFileSync(join(here, "../../../../packages/pack-mmx-starter/data/game.json"), "utf8"),
);
const STARTER = [{ id: "mmx-starter", version: 1 }];

/** A temp copy of the minimal fixture: a project from before packs (no `packs`, no data/game.json). */
async function withOldProject(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "mmx-starter-pack-"));
  try {
    await cp(fixtureRoot, root, { recursive: true });
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const readJson = async (root: string, path: string) =>
  JSON.parse(await readFile(join(root, path), "utf8"));

test("an old project gets the pack on load, in memory only; Save writes data/game.json and packs", async () => {
  await withOldProject(async (root) => {
    const fs = createNodeFileSystem(root);
    const manifestBefore = await readFile(join(root, "project.json"), "utf8");
    const loaded = await loadProject(fs);
    assert.equal(loaded.ok, true, JSON.stringify(loaded.issues));
    if (!loaded.ok) return;
    assert.deepEqual(loaded.value.manifest.packs, STARTER);
    assert.deepEqual(loaded.value.gameData, PACK);
    assert.deepEqual(loaded.issues, []);
    // Opening writes nothing.
    assert.equal(await readFile(join(root, "project.json"), "utf8"), manifestBefore);
    assert.equal((await readdir(root)).includes("data"), false);

    const saved = await saveProject(fs, loaded.value);
    assert.equal(saved.ok, true, JSON.stringify(saved.issues));
    assert.deepEqual((await readJson(root, "project.json")).packs, STARTER);
    assert.deepEqual(await readJson(root, "data/game.json"), PACK);

    // Reopened, a migrated project is left as is.
    const reloaded = await loadProject(fs);
    assert.ok(reloaded.ok);
    assert.deepEqual(reloaded.value.manifest.packs, STARTER);
    assert.deepEqual(reloaded.value.gameData, PACK);
  });
});

test("an old project's own data/game.json records are kept, and only missing ids are added", async () => {
  await withOldProject(async (root) => {
    const metool = { ...PACK.enemies.metool, touchDamage: 7 };
    const crab = { ...PACK.enemies.metool, id: "crab" };
    const own = { schemaVersion: 1, enemies: { metool, crab } };
    await createNodeFileSystem(root).writeText("data/game.json", JSON.stringify(own));
    const loaded = await loadProject(createNodeFileSystem(root));
    assert.ok(loaded.ok);
    const enemies = loaded.value.gameData?.enemies ?? {};
    assert.deepEqual(enemies.metool, metool);
    assert.deepEqual(enemies.crab, crab);
    assert.deepEqual(enemies.bat, PACK.enemies.bat);
    assert.deepEqual(loaded.value.gameData?.pickups, PACK.pickups);
  });
});

test("a packs: [] project stays base only: nothing added on load or save", async () => {
  await withOldProject(async (root) => {
    const manifest = await readJson(root, "project.json");
    await writeFile(join(root, "project.json"), JSON.stringify({ ...manifest, packs: [] }));
    const fs = createNodeFileSystem(root);
    const loaded = await loadProject(fs);
    assert.ok(loaded.ok);
    assert.deepEqual(loaded.value.manifest.packs, []);
    assert.equal(loaded.value.gameData, undefined);
    assert.ok((await saveProject(fs, loaded.value)).ok);
    assert.deepEqual((await readJson(root, "project.json")).packs, []);
    assert.equal((await readdir(root)).includes("data"), false);
  });
});

test("a broken data/game.json fails the load and is not migrated over", async () => {
  await withOldProject(async (root) => {
    await createNodeFileSystem(root).writeText("data/game.json", "{ nope");
    const loaded = await loadProject(createNodeFileSystem(root));
    assert.equal(loaded.ok, false);
    assert.equal(await readFile(join(root, "data/game.json"), "utf8"), "{ nope");
  });
});

test("a new project carries the pack, and an export of a migrated, unsaved project keeps it", async () => {
  const fs = createMemoryFileSystem();
  const created = await createProject(fs, { id: "new.project", name: "New" });
  assert.ok(created.ok);
  assert.deepEqual(created.value.manifest.packs, STARTER);
  assert.deepEqual(created.value.gameData, PACK);
  assert.deepEqual(JSON.parse(await fs.readText("project.json")).packs, STARTER);
  assert.deepEqual(JSON.parse(await fs.readText("data/game.json")), PACK);

  await withOldProject(async (root) => {
    const source = createNodeFileSystem(root);
    const loaded = await loadProject(source);
    assert.ok(loaded.ok);
    const dest = createMemoryFileSystem();
    const exported = await exportProject(source, dest, loaded.value);
    assert.equal(exported.ok, true, JSON.stringify(exported.issues));
    assert.deepEqual(JSON.parse(await dest.readText("project.json")).packs, STARTER);
    assert.deepEqual(JSON.parse(await dest.readText("data/game.json")), PACK);
  });
});
