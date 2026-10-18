import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// Contract C-PACK-ART / C-PART: the MMX Starter and MMX — X packs own their art; the templates
// hold physical copies (Studio bundles them), kept byte-identical by
// scripts/starter-template/generate-manifest.mjs, and bind them as the packs' bindings.json do.
const templates = join(dirname(fileURLToPath(import.meta.url)), "../../templates");
const packages = join(templates, "../../../packages");
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

type Entry = { id: string; path: string };
const PACKS = {
  "pack-mmx-starter": {
    files: 8,
    ids: [
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
    ],
  },
  "pack-mmx-player-x": {
    files: 3,
    ids: ["anim.player.x", "sprite.player.x", "sprite.player.x-leftarm"],
  },
};

for (const [dir, expected] of Object.entries(PACKS)) {
  const packRoot = join(packages, dir);
  const packEntries: Entry[] = readJson(join(packRoot, "assets.json")).assets;
  const packBindings: Record<string, unknown> = readJson(join(packRoot, "bindings.json"));
  const packFiles = readdirSync(join(packRoot, "assets"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(packRoot, join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
    .sort();

  test(`${dir}'s manifest fragment lists its ${expected.ids.length} entries, all pointing at its own files`, () => {
    assert.deepEqual(packEntries.map((entry) => entry.id).sort(), expected.ids);
    for (const entry of packEntries) assert.ok(packFiles.includes(entry.path), entry.path);
    assert.equal(packFiles.length, expected.files);
  });

  for (const name of ["mmx-starter", "mmx-demo"]) {
    test(`the ${name} template holds ${dir}'s files, entries and bindings byte for byte`, () => {
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
      const { bindings } = readJson(join(templates, name, "game/data.json"));
      for (const [key, value] of Object.entries(packBindings)) {
        if (typeof value === "string") assert.equal(bindings[key], value, `${name}: ${key}`);
        else assert.deepEqual({ ...bindings[key], ...value }, bindings[key], `${name}: ${key}`);
      }
    });
  }
}
