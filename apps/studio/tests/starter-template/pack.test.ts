import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { requireProject } from "@mmx/build-tools";
import { MMX_PLAYER_X, MMX_PLAYER_ZERO, MMX_STARTER, mergePack } from "@mmx/content-schema";

import { copyStarterProjectToDirectory } from "../../src/starter-template/index.js";

const templates = join(dirname(fileURLToPath(import.meta.url)), "../../templates");
const xPackRoot = join(templates, "../../../packages/pack-mmx-player-x");
const readJson = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const PACKS = [
  { id: "mmx-starter", version: 1 },
  { id: "mmx-player-x", version: 1 },
  { id: "mmx-player-zero", version: 1 },
];

/** The Starter, X and Zero packs' records merged as Install adds them to an empty project. */
const MERGED = [MMX_STARTER, MMX_PLAYER_X, MMX_PLAYER_ZERO].reduce(
  (overlay, pack) => mergePack({ manifest: {}, overlay }, pack).overlay,
  undefined as (typeof MMX_STARTER)["data"] | undefined,
);

for (const name of ["mmx-starter", "mmx-demo"]) {
  test(`the ${name} template carries the Starter, X and Zero packs and their markers`, async () => {
    assert.deepEqual(await readJson(join(templates, name, "data/game.json")), MERGED);
    assert.deepEqual((await readJson(join(templates, name, "project.json"))).packs, PACKS);
  });

  test(`build-tools compiles the ${name} template to the former built-in hash`, async () => {
    const project = await requireProject(join(templates, name));
    assert.deepEqual(project.manifest.packs, PACKS);
    assert.equal(project.compiledGameData.hash, "36e5bb6d8c3547a6");
  });
}

test("a project made from the starter template carries the packs and X's art", async () => {
  const root = await mkdtemp(join(tmpdir(), "mmx-starter-pack-copy-"));
  try {
    const created = await copyStarterProjectToDirectory(root, { id: "my.game", name: "My game" });
    assert.ok(created.ok, JSON.stringify(created.issues));
    assert.deepEqual(created.value.manifest.packs, PACKS);
    assert.deepEqual(created.value.gameData, MERGED);
    assert.deepEqual((await readJson(join(root, "project.json"))).packs, PACKS);
    const ids = new Set(created.value.manifest.assets.map((asset) => asset.id));
    for (const { id, path } of MMX_PLAYER_X.assets) {
      assert.ok(ids.has(id), id);
      assert.ok((await readFile(join(root, path))).equals(await readFile(join(xPackRoot, path))));
    }
    const { bindings } = await readJson(join(root, "game/data.json"));
    assert.equal(bindings.playerAnimation, "anim.player.x");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
