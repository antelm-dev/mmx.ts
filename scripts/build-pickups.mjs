/**
 * Builds resources/sprites/pickups/pickup_anims.json from the Godot project's
 * Life Energy and Weapon Energy capsule scenes.
 *
 *   node scripts/build-pickups.mjs [path-to-godot-project]   # or: pnpm pickups:import
 *
 * Unlike the enemies (which carry Aseprite JSON sidecars — see
 * build-enemies.mjs), Heal.tscn / SmallHeal.tscn / Ammo.tscn / SmallAmmo.tscn
 * only ever had Godot's own SpriteFrames .tres resource, so this reads that
 * text format directly: each numbered `[sub_resource ... AtlasTexture]` block
 * is one atlas rect, and the trailing `[resource]` section's `animations`
 * array names which rects belong to which clip, in order, at a fixed fps.
 * Godot bakes per-frame timing into that one `speed` value rather than a
 * per-frame duration, so — unlike the Aseprite-sourced clips — every frame
 * here gets an equal share of it.
 */
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const godot = resolve(repo, process.argv[2] ?? "../Mega-Man-X8-16-bit");
const pickupsDir = join(godot, "src/Objects/Pickups");
const assets = join(repo, "resources/sprites/pickups");

/**
 * `small` -> SmallHeal.tscn (heal = 2), `large` -> Heal.tscn (heal = 8). These
 * kinds match LIFE_CAPSULE_STATS in packages/engine/src/core/constants.ts.
 *
 * The Weapon Energy capsules (Ammo.tscn / SmallAmmo.tscn, matching
 * WEAPON_CAPSULE_STATS) are a second actor table built by this same script —
 * exact same PickUp.gd-derived SpriteFrames format, a different pair of
 * scenes under the same Objects/Pickups directory. Keyed by *sheet* name
 * ("ammo"/"sammo") rather than by capsule size like CAPSULES above: both
 * tables are merged into one `actors` object in the output JSON, and Life/
 * Weapon capsules already spend "small"/"large" on their own (differently
 * sized) kind — reusing it here would silently overwrite the heal sprites.
 */
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
console.log("pickup_anims.json + sheets written to resources/sprites/pickups");
