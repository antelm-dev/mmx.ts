/**
 * Adds the arm-pointing atlas regions to resources/sprites/player/x_anims.json.
 *
 * The Godot project draws X with an AnimatedSprite whose SpriteFrames resource is
 * swapped wholesale while the buster is out (Shot.gd: normal_sprites = x.res ->
 * arm_pointing_sprites = x_leftarm.res). The clip names, frame lists and frame
 * indices are identical between the two sets -- only the pixels differ -- so every
 * pose (walking, jumping, dashing, wall-sliding...) has an arm-out twin.
 *
 * x_anims.json already carries the clip structure exported from x.res, with each
 * frame stored as a region into x.png. The two atlases pack the same 217 frames at
 * different coordinates, so this script resolves each region back to its frame index
 * via the Aseprite sheet descriptions (x.json) and writes the matching region from
 * x_leftarm.json as `armRegion`.
 *
 * Usage:  node scripts/build-anims.mjs [path-to-godot-project]
 * Also copies x_leftarm.png next to x.png in the shared resources.
 */
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const godot = resolve(repo, process.argv[2] ?? "../Mega-Man-X8-16-bit");
const sprites = join(godot, "src/Actors/Player/x_sprites");
const assets = join(repo, "resources/sprites/player");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

const base = readJson(join(sprites, "x.json"));
const arm = readJson(join(sprites, "x_leftarm.json"));
const animsPath = join(assets, "x_anims.json");
const anims = readJson(animsPath);

if (base.frames.length !== arm.frames.length) {
  throw new Error(
    `atlas frame count mismatch: x.json has ${base.frames.length}, x_leftarm.json has ${arm.frames.length}`,
  );
}

// region top-left in x.png -> frame index -> region in x_leftarm.png
const indexOfRegion = new Map(base.frames.map((f, i) => [`${f.frame.x},${f.frame.y}`, i]));

let patched = 0;
for (const [clipName, clip] of Object.entries(anims.animations)) {
  for (const frame of clip.frames) {
    const [x, y] = frame.region;
    const idx = indexOfRegion.get(`${x},${y}`);
    if (idx === undefined) {
      throw new Error(`${clipName}: region ${x},${y} is not a frame of x.png`);
    }
    const a = arm.frames[idx].frame;
    frame.armRegion = [a.x, a.y, a.w, a.h];
    patched++;
  }
}

writeFileSync(animsPath, JSON.stringify(anims, null, 2) + "\n");
copyFileSync(join(sprites, "x_leftarm.png"), join(assets, "x_leftarm.png"));

console.log(`x_anims.json: added armRegion to ${patched} frames`);
console.log("x_leftarm.png: copied to resources/sprites/player");
