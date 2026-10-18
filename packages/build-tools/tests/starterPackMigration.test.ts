import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import pack from "@mmx/pack-mmx-starter/data/game.json" with { type: "json" };
import xPack from "@mmx/pack-mmx-player-x/data/game.json" with { type: "json" };
import zeroPack from "@mmx/pack-mmx-player-zero/data/game.json" with { type: "json" };
import { GAME_DATA, mergeGameData, type GameData, type GameDataOverlay } from "@mmx/engine/data";
import { requireProject } from "../src/loadProject.js";

const syntheticProject = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "synthetic-project",
);
/** The engine's hash while the MMX objects and players were built in: core + packs keeps it. Re-frozen when the core hazard prefab gained its Lethal and Damage fields. */
const BUILTIN_HASH = "9d8a9efb04583a0e";
const STARTER = [{ id: "mmx-starter", version: 1 }];
const PLAYERS = [
  { id: "mmx-player-x", version: 1 },
  { id: "mmx-player-zero", version: 1 },
];

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

test("an old project gets the MMX Starter, X and Zero in memory, compiles to the built-in hash, and nothing is written", async () => {
  const dir = await oldProject();
  try {
    const before = await snapshot(dir);
    const project = await requireProject(dir);
    assert.deepEqual(project.manifest.packs, [...STARTER, ...PLAYERS]);
    assert.equal(project.compiledGameData.hash, BUILTIN_HASH);
    const withPacks = [pack, xPack, zeroPack].reduce((data: GameData, overlay) => {
      const merged = mergeGameData(data, overlay as GameDataOverlay);
      assert.ok(merged.ok);
      return merged.value;
    }, GAME_DATA);
    assert.deepEqual(project.gameData, withPacks);
    assert.deepEqual(await snapshot(dir), before);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("an old project's own records are kept over the pack's", async () => {
  const dir = await oldProject(async (root) => {
    const metool = { ...pack.enemies.metool, touchDamage: 7 };
    await fs.mkdir(path.join(root, "data"));
    await fs.writeFile(
      path.join(root, "data/game.json"),
      JSON.stringify({ schemaVersion: 1, enemies: { metool } }),
    );
  });
  try {
    const project = await requireProject(dir);
    assert.deepEqual(project.manifest.packs, [...STARTER, ...PLAYERS]);
    assert.equal(project.gameData.enemies.metool?.touchDamage, 7);
    assert.deepEqual(project.gameData.enemies.bat, pack.enemies.bat);
    assert.notEqual(project.compiledGameData.hash, BUILTIN_HASH);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("a project with packs: [] stays on the base data: the primitives only", async () => {
  const dir = await oldProject(async (_root, manifest) => {
    manifest.packs = [];
  });
  try {
    const project = await requireProject(dir);
    assert.deepEqual(project.manifest.packs, []);
    assert.equal(project.gameData, GAME_DATA);
    assert.deepEqual(Object.keys(project.gameData.prefabs).sort(), [
      "camera-zone",
      "hazard",
      "spawn",
    ]);
    assert.deepEqual(project.gameData.enemies, {});
    assert.deepEqual(project.gameData.pickups, {});
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("a project with packs: [mmx-starter] gets X and Zero in memory, keeps the hash, and nothing is written", async () => {
  const dir = await oldProject(async (root, manifest) => {
    manifest.packs = STARTER;
    manifest.player = { loadout: "player.zero" };
    await fs.mkdir(path.join(root, "data"));
    await fs.writeFile(path.join(root, "data/game.json"), JSON.stringify(pack));
  });
  try {
    const before = await snapshot(dir);
    const project = await requireProject(dir);
    assert.deepEqual(project.manifest.packs, [...STARTER, ...PLAYERS]);
    assert.equal(project.compiledGameData.hash, BUILTIN_HASH);
    assert.ok(project.compiledGameData.loadouts.has("player.x"));
    assert.ok(project.compiledGameData.loadouts.has("player.zero"));
    assert.deepEqual(await snapshot(dir), before);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
