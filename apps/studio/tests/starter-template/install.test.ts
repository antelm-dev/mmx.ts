import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { MMX_PLAYER_X, MMX_PLAYER_ZERO, MMX_STARTER, mergePack } from "@mmx/content-schema";

import { installPack } from "../../src/starter-template/install.js";

// Contract C-INSTALL, on temporary copies of the minimal fixture (a project from before packs).
const fixtureRoot = resolve(import.meta.dirname, "../project-io/fixtures/minimal-project");
const packages = resolve(import.meta.dirname, "../../../../packages");
const packRoot = (id: string) => join(packages, `pack-${id}`);
const starterRoot = packRoot("mmx-starter");
const pack = JSON.parse(readFileSync(join(starterRoot, "data/game.json"), "utf8"));
const PACKS = [MMX_STARTER, MMX_PLAYER_X, MMX_PLAYER_ZERO];
const packAssets = PACKS.flatMap((p) => p.assets);
/** The three packs' records, as Install adds them to a project without any. */
const MERGED = PACKS.reduce(
  (overlay, p) => mergePack({ manifest: {}, overlay }, p).overlay,
  undefined as (typeof MMX_STARTER)["data"] | undefined,
);
const PACK_REFS = PACKS.map((p) => p.ref);
const readJson = async (root: string, path: string) =>
  JSON.parse(await readFile(join(root, path), "utf8"));

async function copy(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "mmx-install-pack-"));
  await cp(fixtureRoot, root, { recursive: true });
  return root;
}

/** Every file under `root` with its bytes, to prove a run wrote nothing. */
async function snapshot(root: string): Promise<Map<string, string>> {
  const files = await readdir(root, { recursive: true, withFileTypes: true });
  const entries = files
    .filter((entry) => entry.isFile())
    .map(async (entry) => {
      const path = join(entry.parentPath, entry.name);
      return [path, (await readFile(path)).toString("base64")] as const;
    });
  return new Map(await Promise.all(entries));
}

test("installPack gives a project the pack's data, art and bindings; a second run adds nothing", async () => {
  const root = await copy();
  try {
    const before = await snapshot(root);
    const preview = await installPack(root, packRoot, true);
    assert.equal(preview.ok, true, JSON.stringify(preview));
    assert.deepEqual(await snapshot(root), before, "a dry run writes nothing");

    const installed = await installPack(root, packRoot);
    assert.equal(installed.ok, true, JSON.stringify(installed));
    if (!installed.ok || !preview.ok) return;
    assert.deepEqual(installed.value, preview.value, "the dry run said what the run did");
    // The fixture plays its own player: X's sheets are added, not bound over it.
    assert.deepEqual(installed.value.skipped, [
      "binding playerAnimation: the project's playerAnimation is kept",
      "binding playerPointingSheet: the project's playerAnimation is kept",
    ]);
    assert.ok(installed.value.added.includes("file assets/sprites/enemies/metool.png"));
    assert.ok(installed.value.added.includes("file assets/sprites/player/x.png"));
    assert.ok(installed.value.added.includes("record loadouts.player.zero"));

    const manifest = await readJson(root, "project.json");
    assert.deepEqual(manifest.packs, PACK_REFS);
    assert.equal(manifest.assets.length, 5 + packAssets.length);
    for (const entry of packAssets) {
      assert.deepEqual(
        manifest.assets.find((a: { id: string }) => a.id === entry.id),
        entry,
      );
    }
    for (const p of PACKS) {
      for (const { path } of p.assets) {
        const copied = await readFile(join(root, path));
        assert.ok(copied.equals(await readFile(join(packRoot(p.ref.id), path))), path);
      }
    }
    assert.deepEqual(await readJson(root, "data/game.json"), MERGED);
    const { bindings } = await readJson(root, "game/data.json");
    assert.equal(bindings.playerAnimation, "anim.player.fixture", "the project's bindings stay");
    assert.equal(bindings.enemyAnimations.metool, "anim.enemy.metool");
    assert.equal(bindings.pickupAnimations.heal, "anim.pickup.large");

    // Every pack binding names an entry the project now has.
    const ids = new Set(manifest.assets.map((a: { id: string }) => a.id));
    for (const group of ["enemyAnimations", "pickupAnimations"]) {
      for (const id of Object.values(bindings[group])) assert.ok(ids.has(id), String(id));
    }

    const after = await snapshot(root);
    const again = await installPack(root, packRoot);
    assert.equal(again.ok, true);
    assert.deepEqual(again.ok && again.value, { added: [], skipped: installed.value.skipped });
    assert.deepEqual(await snapshot(root), after, "the second run writes nothing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("installPack keeps a different file at a pack path and the user's records", async () => {
  const root = await copy();
  try {
    const mine = Buffer.from("not the pack's capsule");
    await writeFile(join(root, "assets/sprites/heal.png"), mine);
    await cp(join(root, "assets/sprites/heal.png"), join(root, "assets/sprites/pickups/heal.png"));
    const metool = { ...pack.enemies.metool, touchDamage: 9 };
    await cp(join(starterRoot, "data"), join(root, "data"), { recursive: true });
    const data = await readJson(root, "data/game.json");
    data.enemies.metool = metool;
    await writeFile(join(root, "data/game.json"), JSON.stringify(data));

    const installed = await installPack(root, packRoot);
    assert.equal(installed.ok, true, JSON.stringify(installed));
    if (!installed.ok) return;
    assert.ok((await readFile(join(root, "assets/sprites/pickups/heal.png"))).equals(mine));
    assert.deepEqual(installed.value.skipped.sort(), [
      "asset anim.pickup.large: assets/sprites/pickups/heal.png holds another file",
      "asset sprite.pickups.heal: assets/sprites/pickups/heal.png holds another file",
      "binding pickupAnimations.heal: anim.pickup.large is not in the project",
      "binding playerAnimation: the project's playerAnimation is kept",
      "binding playerPointingSheet: the project's playerAnimation is kept",
      "file assets/sprites/pickups/heal.png: kept the project's",
      "record enemies.metool: the project's values kept",
    ]);
    const ids = (await readJson(root, "project.json")).assets.map((a: { id: string }) => a.id);
    assert.ok(!ids.includes("sprite.pickups.heal") && ids.includes("sprite.pickups.sheal"));
    assert.deepEqual((await readJson(root, "data/game.json")).enemies.metool, metool);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("installPack writes nothing into a project Studio cannot open", async () => {
  const root = await copy();
  try {
    await rm(join(root, "assets/sprites/bg.png"));
    const before = await snapshot(root);
    const result = await installPack(root, packRoot);
    assert.equal(result.ok, false);
    assert.deepEqual(await snapshot(root), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// Contract C-PART: a project carrying only the Starter pack gets X and Zero, X's art and bindings.
test("installPack on a packs:[mmx-starter] project adds X and Zero, binding X's sheets", async () => {
  const root = await copy();
  try {
    const manifest = await readJson(root, "project.json");
    await writeFile(
      join(root, "project.json"),
      JSON.stringify({ ...manifest, packs: [MMX_STARTER.ref] }),
    );
    await cp(join(starterRoot, "data"), join(root, "data"), { recursive: true });
    const gameData = await readJson(root, "game/data.json");
    delete gameData.bindings.playerAnimation;
    await writeFile(join(root, "game/data.json"), JSON.stringify(gameData));
    // No player bound: Install binds X's sheets, which it adds.
    const installed = await installPack(root, packRoot);
    assert.equal(installed.ok, true, JSON.stringify(installed));
    if (!installed.ok) return;
    assert.deepEqual(installed.value.skipped, []);
    for (const line of [
      "pack mmx-player-x v1",
      "pack mmx-player-zero v1",
      "record loadouts.player.x",
      "record loadouts.player.zero",
      "asset anim.player.x",
      "file assets/sprites/player/x_leftarm.png",
      "binding playerAnimation",
      "binding playerPointingSheet",
    ])
      assert.ok(installed.value.added.includes(line), line);
    assert.deepEqual((await readJson(root, "project.json")).packs, PACK_REFS);
    assert.deepEqual(await readJson(root, "data/game.json"), MERGED);
    const { bindings } = await readJson(root, "game/data.json");
    assert.equal(bindings.playerAnimation, "anim.player.x");
    assert.equal(bindings.playerPointingSheet, "sprite.player.x-leftarm");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
