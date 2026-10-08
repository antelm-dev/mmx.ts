import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Input, Player, World, loadLevel } from "@mmx/engine";
import { loadEntryLevel } from "../src/project.js";

const fixture = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../packages/build-tools/tests/fixtures/synthetic-project",
);

async function projectWithPlayer(player: unknown): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-sim-loadout-"));
  await fs.cp(fixture, dir, { recursive: true });
  const manifestPath = path.join(dir, "project.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  await fs.writeFile(manifestPath, JSON.stringify({ ...manifest, player }), "utf8");
  // The fixture's level ships no tiles; give it an empty grid so the engine can build it.
  const levelPath = path.join(dir, "levels/level.main.json");
  const level = JSON.parse(await fs.readFile(levelPath, "utf8"));
  level.tiles = Array.from({ length: level.cols * level.rows }, () => 0);
  await fs.writeFile(levelPath, JSON.stringify(level), "utf8");
  return dir;
}

function movesetOf(loadoutId: string): string[] {
  return new Player(World.fromRows(["#"]), 0, 0, new Input(), undefined, loadoutId).moveset.map(
    (m) => m.name,
  );
}

test("the sim boots a project with player.loadout = player.zero as Zero", async () => {
  const dir = await projectWithPlayer({ loadout: "player.zero" });
  try {
    // Same wiring as run.ts.
    const entry = await loadEntryLevel(dir);
    assert.equal(entry.loadoutId, "player.zero");
    const level = loadLevel(entry.level);
    const player = new Player(
      level.world,
      level.spawn.x,
      level.spawn.y,
      new Input(),
      undefined,
      entry.loadoutId,
    );
    const moveset = player.moveset.map((m) => m.name);
    assert.deepEqual(moveset, movesetOf("player.zero"));
    assert.notDeepEqual(moveset, movesetOf("player.x"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("the sim refuses a project whose player.loadout is not compiled", async () => {
  const dir = await projectWithPlayer({ loadout: "player.vile" });
  try {
    await assert.rejects(loadEntryLevel(dir), /player\.loadout 'player\.vile'/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
