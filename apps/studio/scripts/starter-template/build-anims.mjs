import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const templateRoot = resolve(here, "../../templates/mmx-starter");
const godot = resolve(templateRoot, process.argv[2] ?? "../../../Mega-Man-X8-16-bit");
const sprites = join(godot, "src/Actors/Player/x_sprites");
const assets = join(templateRoot, "assets/sprites/player");

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
console.log("x_leftarm.png: copied to templates/mmx-starter/assets/sprites/player");
