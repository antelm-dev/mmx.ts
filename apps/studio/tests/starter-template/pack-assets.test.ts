import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// Contract C-PACK-ART: the MMX Starter pack owns its art; the templates hold physical copies
// (Studio bundles them), kept byte-identical by scripts/starter-template/generate-manifest.mjs.
const templates = join(dirname(fileURLToPath(import.meta.url)), "../../templates");
const packRoot = join(templates, "../../../packages/pack-mmx-starter");
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

type Entry = { id: string; path: string };
const packEntries: Entry[] = readJson(join(packRoot, "assets.json")).assets;
const packFiles = readdirSync(join(packRoot, "assets"), { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => relative(packRoot, join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
  .sort();

test("the pack's manifest fragment lists its 12 entries, all pointing at its own files", () => {
  assert.deepEqual(packEntries.map((entry) => entry.id).sort(), [
    "anim.enemy.bat",
    "anim.enemy.metool",
    "anim.pickup.ammo",
    "anim.pickup.large",
    "anim.pickup.sammo",
    "anim.pickup.small",
    "sprite.enemies.metool",
    "sprite.enemies.sbat",
    "sprite.pickups.ammo",
    "sprite.pickups.heal",
    "sprite.pickups.sammo",
    "sprite.pickups.sheal",
  ]);
  for (const entry of packEntries) assert.ok(packFiles.includes(entry.path), entry.path);
  assert.equal(packFiles.length, 8);
});

for (const name of ["mmx-starter", "mmx-demo"]) {
  test(`the ${name} template holds the pack's files and entries byte for byte`, () => {
    for (const file of packFiles) {
      assert.ok(
        readFileSync(join(packRoot, file)).equals(readFileSync(join(templates, name, file))),
        `${name}/${file} differs from the pack`,
      );
    }
    const assets: Entry[] = readJson(join(templates, name, "project.json")).assets;
    for (const entry of packEntries) {
      const own = assets.find((asset) => asset.id === entry.id);
      assert.equal(JSON.stringify(own), JSON.stringify(entry), `${name}: ${entry.id}`);
    }
  });
}
