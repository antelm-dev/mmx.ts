import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const templateRoot = resolve(here, "../../templates/mmx-starter");
const godot = resolve(templateRoot, process.argv[2] ?? "../../../Mega-Man-X8-16-bit");
const pickupsDir = join(godot, "src/Objects/Pickups");
const assets = join(templateRoot, "assets/sprites/pickups");

const CAPSULES = {
  small: { png: "sheal.png", tres: "sheal.tres" },
  large: { png: "heal.png", tres: "heal.tres" },
};

const WEAPON_CAPSULES = {
  sammo: { png: "sammo.png", tres: "sammo.tres" },
  ammo: { png: "ammo.png", tres: "ammo.tres" },
};

const ATLAS_RE =
  /\[sub_resource type="AtlasTexture" id=(\d+)\]\s*\n\s*atlas = ExtResource\(\s*\d+\s*\)\s*\n\s*region = Rect2\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\)/g;
const ANIM_BLOCK_RE = /\{([^{}]*"frames"[^{}]*)\}/g;

function buildCapsule({ tres }) {
  const src = readFileSync(join(pickupsDir, tres), "utf8");

  const regions = new Map();
  for (const [, id, x, y, w, h] of src.matchAll(ATLAS_RE)) {
    regions.set(id, [Number(x), Number(y), Number(w), Number(h)]);
  }
  if (regions.size === 0) throw new Error(`${tres}: no AtlasTexture sub_resources found`);

  const animations = {};
  const animBlock = src.slice(src.indexOf("animations = ["));
  for (const [, block] of animBlock.matchAll(ANIM_BLOCK_RE)) {
    const name = /"name"\s*:\s*"([^"]+)"/.exec(block)?.[1];
    const loop = /"loop"\s*:\s*(true|false)/.exec(block)?.[1] === "true";
    const speed = Number(/"speed"\s*:\s*([\d.]+)/.exec(block)?.[1]);
    if (!name || !Number.isFinite(speed)) throw new Error(`${tres}: malformed animation block`);

    const frames = [...block.matchAll(/SubResource\(\s*(\d+)\s*\)/g)].map(([, id]) => {
      const region = regions.get(id);
      if (!region)
        throw new Error(`${tres}: animation '${name}' references missing SubResource ${id}`);
      return { region, duration: 1 };
    });
    animations[name] = { loop, speed, frames };
  }
  if (Object.keys(animations).length === 0) throw new Error(`${tres}: no animations parsed`);
  return animations;
}

const out = { sheets: {}, actors: {} };
for (const [name, capsule] of Object.entries({ ...CAPSULES, ...WEAPON_CAPSULES })) {
  out.sheets[name] = capsule.png;
  out.actors[name] = { sheet: capsule.png, animations: buildCapsule(capsule) };
  copyFileSync(join(pickupsDir, capsule.png), join(assets, capsule.png));
}

writeFileSync(join(assets, "pickup_anims.json"), JSON.stringify(out, null, 2) + "\n");

for (const [name, actor] of Object.entries(out.actors)) {
  const clips = Object.entries(actor.animations)
    .map(([clip, data]) => `${clip}(${data.frames.length}${data.loop ? " loop" : ""})`)
    .join(" ");
  console.log(`${name}: ${clips}`);
}
console.log("pickup_anims.json + sheets written to templates/mmx-starter/assets/sprites/pickups");
