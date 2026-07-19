/**
 * Builds packages/renderer-pixi/src/assets/enemy_anims.json from the Godot project's Aseprite sheets.
 *
 *   node tools/build-enemies.mjs [path-to-godot-project]   # or: pnpm enemies:import
 *
 * The player's clips came out of Godot .res SpriteFrames resources (binary, and
 * already exported to x_anims.json). The enemies still have their *source*
 * Aseprite sidecars checked in next to the .png, and those carry everything a
 * clip needs: `frames` gives each cel's atlas rect and its duration in
 * milliseconds, and `meta.frameTags` names the ranges. So this reads the Aseprite
 * JSON directly rather than going through Godot.
 *
 * One thing the Aseprite file cannot tell us is whether a clip loops — that flag
 * lives in the Godot SpriteFrames. It is declared per clip in LOOPING below, and
 * it is load-bearing rather than cosmetic: EnemyStun advances out of its stun on
 * `animation_finished`, so a looping "stun" would leave the enemy stunned forever.
 */
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const godot = resolve(repo, process.argv[2] ?? "../Mega-Man-X8-16-bit");
const enemies = join(godot, "src/Actors/Enemies");
const assets = join(repo, "packages/renderer-pixi/src/assets");

/**
 * Which sheets to import, and which clips of each hold their last frame.
 *
 * `sheet` is the file name the renderer keys textures by (see SHEET_URLS), and
 * doubles as the name of the copy written into the renderer package assets.
 */
const ACTORS = {
  metool: {
    dir: "Metool",
    json: "metool.json",
    sheet: "metool.png",
    // "open" hands off to the walk on animation_finished and "stun" ends the
    // stun state the same way; both must terminate. The resting/locomotion
    // clips cycle.
    looping: ["idle", "walk", "defense"],
  },
  bat: {
    dir: "SmallBat",
    json: "sbat.json",
    sheet: "sbat.png",
    // "jump" is the recoil hop, played once per contact.
    looping: ["idle"],
  },
};

/**
 * Aseprite stores a per-frame duration in milliseconds; the engine's clip format
 * stores a frames-per-second `speed` and a per-frame `duration` multiplier, and
 * spends `duration / speed` seconds on each frame. Fixing speed at 1000 makes
 * that milliseconds-over-1000, i.e. the Aseprite timing exactly, with no rounding
 * onto a common frame rate.
 */
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
console.log("enemy_anims.json + sheets written to packages/renderer-pixi/src/assets");
