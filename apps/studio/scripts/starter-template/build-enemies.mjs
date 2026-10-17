import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// The MMX Starter pack owns this art; generate-manifest.mjs copies it into the templates.
const packRoot = resolve(here, "../../../../packages/pack-mmx-starter");
const godot = resolve(packRoot, process.argv[2] ?? "../../../Mega-Man-X8-16-bit");
const enemies = join(godot, "src/Actors/Enemies");
const assets = join(packRoot, "assets/sprites/enemies");

const ACTORS = {
  metool: {
    dir: "Metool",
    json: "metool.json",
    sheet: "metool.png",
    looping: ["idle", "walk", "defense"],
  },
  bat: {
    dir: "SmallBat",
    json: "sbat.json",
    sheet: "sbat.png",
    looping: ["idle"],
  },
};

const SPEED = 1000;

function buildActor({ dir, json, looping }) {
  const src = JSON.parse(readFileSync(join(enemies, dir, json), "utf8"));
  const tags = src.meta?.frameTags ?? [];
  if (tags.length === 0) throw new Error(`${json}: no frameTags; nothing to name the clips`);

  const animations = {};
  for (const tag of tags) {
    const frames = [];
    for (let i = tag.from; i <= tag.to; i++) {
      const cel = src.frames[i];
      if (!cel) throw new Error(`${json}: tag '${tag.name}' references missing frame ${i}`);
      const { x, y, w, h } = cel.frame;
      frames.push({ region: [x, y, w, h], duration: cel.duration });
    }
    animations[tag.name] = { loop: looping.includes(tag.name), speed: SPEED, frames };
  }

  for (const name of looping) {
    if (!animations[name]) throw new Error(`${json}: LOOPING names '${name}', which is not a tag`);
  }
  return animations;
}

const out = { sheets: {}, actors: {} };
for (const [name, actor] of Object.entries(ACTORS)) {
  out.sheets[name] = actor.sheet;
  out.actors[name] = { sheet: actor.sheet, animations: buildActor(actor) };
  copyFileSync(join(enemies, actor.dir, actor.sheet), join(assets, actor.sheet));
}

writeFileSync(join(assets, "enemy_anims.json"), JSON.stringify(out, null, 2) + "\n");

for (const [name, actor] of Object.entries(out.actors)) {
  const clips = Object.entries(actor.animations)
    .map(([clip, data]) => `${clip}(${data.frames.length}${data.loop ? " loop" : ""})`)
    .join(" ");
  console.log(`${name}: ${clips}`);
}
console.log(
  "enemy_anims.json + sheets written to packages/pack-mmx-starter/assets/sprites/enemies; run generate-manifest.mjs next",
);
