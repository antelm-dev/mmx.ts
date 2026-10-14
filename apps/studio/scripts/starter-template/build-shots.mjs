import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const templateRoot = resolve(here, "../../templates/mmx-starter");
const godot = resolve(templateRoot, process.argv[2] ?? "../../../Mega-Man-X8-16-bit");
const projectiles = join(godot, "src/Actors/Weapons/Projectiles");
const textures = join(godot, "src/Effects/Textures");
const darkArrow = join(godot, "src/Actors/Player/BossWeapons/DarkArrow");
const assets = join(templateRoot, "assets/sprites/effects");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

function pngSize(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path}: not a PNG`);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

function clipFromAseprite(jsonPath) {
  const sheet = readJson(jsonPath);
  const frames = Object.values(sheet.frames);
  const shortestMs = Math.min(...frames.map((f) => f.duration));
  return {
    loop: true,
    speed: 1000 / shortestMs,
    frames: frames.map((f) => ({
      region: [f.frame.x, f.frame.y, f.frame.w, f.frame.h],
      duration: f.duration / shortestMs,
    })),
  };
}

function clipFromGrid(pngPath, hframes, vframes, fps) {
  const { w, h } = pngSize(pngPath);
  const fw = w / hframes;
  const fh = h / vframes;
  const frames = [];
  for (let row = 0; row < vframes; row++) {
    for (let col = 0; col < hframes; col++) {
      frames.push({ region: [col * fw, row * fh, fw, fh], duration: 1 });
    }
  }
  return { loop: false, speed: fps, frames };
}

function clipFromRegion(region, fps) {
  return { loop: true, speed: fps, frames: [{ region, duration: 1 }] };
}

const CHARGE_FX_FPS = 16 / 0.3;

const animations = {
  lemon: clipFromAseprite(join(projectiles, "lemon.json")),
  medium: clipFromAseprite(join(projectiles, "medium_shot.json")),
  charged: clipFromAseprite(join(projectiles, "heavy_shot.json")),
  dark_arrow: clipFromRegion([0, 0, 32, 16], 5),
  lemon_hit: clipFromGrid(join(textures, "lemon_hit.png"), 2, 2, 32),
  charge_hit: clipFromGrid(join(textures, "charge_hit.png"), 2, 2, 32),
  charge_1: clipFromGrid(join(textures, "charge_1.png"), 4, 4, CHARGE_FX_FPS),
  charge_2: clipFromGrid(join(textures, "charge_2.png"), 4, 4, CHARGE_FX_FPS),
  dash: clipFromGrid(join(textures, "dash.png"), 3, 2, 24),
  explosion: clipFromGrid(join(textures, "explosion.png"), 4, 4, 24),
  remains: clipFromGrid(join(textures, "remains.png"), 6, 3, 1),
};

const sheets = {
  lemon: "lemon.png",
  medium: "medium_shot.png",
  charged: "heavy_shot.png",
  dark_arrow: "dark_arrow.png",
  lemon_hit: "lemon_hit.png",
  charge_hit: "charge_hit.png",
  charge_1: "charge_1.png",
  charge_2: "charge_2.png",
  dash: "dash.png",
  explosion: "explosion.png",
  remains: "remains.png",
};

writeFileSync(
  join(assets, "shot_anims.json"),
  JSON.stringify({ sheets, animations }, null, 2) + "\n",
);

for (const [src, dir] of [
  ["lemon.png", projectiles],
  ["medium_shot.png", projectiles],
  ["heavy_shot.png", projectiles],
  ["dark_arrow.png", darkArrow],
  ["lemon_hit.png", textures],
  ["charge_hit.png", textures],
  ["charge_1.png", textures],
  ["charge_2.png", textures],
  ["dash.png", textures],
  ["explosion.png", textures],
  ["remains.png", textures],
]) {
  copyFileSync(join(dir, src), join(assets, src));
}

for (const [name, clip] of Object.entries(animations)) {
  const [, , w, h] = clip.frames[0].region;
  console.log(
    `${name.padEnd(11)} ${String(clip.frames.length).padStart(2)} frames  ` +
      `${w}x${h}  ${clip.speed.toFixed(1)}fps${clip.loop ? " loop" : ""}`,
  );
}
console.log(
  `\nshot_anims.json + ${Object.keys(sheets).length} sheets written to templates/mmx-starter/assets/sprites/effects`,
);
