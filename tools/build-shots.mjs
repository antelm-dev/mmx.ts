/**
 * Builds src/web/assets/shot_anims.json (+ copies the sheets) for buster shots,
 * their hit effects, and the charge-up aura.
 *
 * Three different sources, because the Godot project stores them three ways:
 *
 *  - The projectiles (lemon / medium_shot / heavy_shot) are Aseprite sheets with a
 *    sibling .json describing every frame's region and duration, exactly like x.json.
 *    Those are read frame-for-frame.
 *
 *  - The hit effects (lemon_hit / charge_hit) have no .json: they are plain Sprite2D
 *    sheets sliced by `hframes`/`vframes` in Basic Hit.tscn / Big Hit.tscn (2x2 each)
 *    and played by SpriteEffect.gd at its own `animation_speed`. Their frame grid is
 *    derived from the PNG's own dimensions, read out of the IHDR chunk so the script
 *    stays dependency-free.
 *
 * Usage:  node tools/build-shots.mjs [path-to-godot-project]
 */
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const godot = resolve(repo, process.argv[2] ?? "../Mega-Man-X8-16-bit");
const projectiles = join(godot, "src/Actors/Weapons/Projectiles");
const textures = join(godot, "src/Effects/Textures");
const assets = join(repo, "src/web/assets");

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

/** Width/height from a PNG's IHDR — always the first chunk, at a fixed offset. */
function pngSize(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path}: not a PNG`);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/**
 * An Aseprite sheet -> ClipData. Aseprite durations are per-frame milliseconds;
 * AnimationPlayer wants a clip fps plus a per-frame multiplier, so the shortest
 * frame sets the clip's fps and every frame's duration becomes a multiple of it.
 * For these sheets every frame is a uniform 42ms, which lands on multiplier 1.
 */
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

/** A Sprite2D sheet sliced by hframes/vframes, as SpriteEffect.gd plays it. */
function clipFromGrid(pngPath, hframes, vframes, fps) {
  const { w, h } = pngSize(pngPath);
  const fw = w / hframes;
  const fh = h / vframes;
  const frames = [];
  // Godot numbers sprite-sheet frames left-to-right, top-to-bottom.
  for (let row = 0; row < vframes; row++) {
    for (let col = 0; col < hframes; col++) {
      frames.push({ region: [col * fw, row * fh, fw, fh], duration: 1 });
    }
  }
  return { loop: false, speed: fps, frames };
}

// The 16 frames of the charge aura are spread across the emitter's 0.3s particle
// lifetime (Player.tscn ChargingParticle), so the sheet's effective rate is fixed
// by that lifetime rather than by an authored fps.
const CHARGE_FX_FPS = 16 / 0.3;

const animations = {
  // Buster projectiles. Names match ShotKind in src/engine/Projectile.ts.
  lemon: clipFromAseprite(join(projectiles, "lemon.json")),
  medium: clipFromAseprite(join(projectiles, "medium_shot.json")),
  charged: clipFromAseprite(join(projectiles, "heavy_shot.json")),
  // Hit effects. 2x2 @ 32fps one-shot — Basic Hit.tscn / Big Hit.tscn.
  lemon_hit: clipFromGrid(join(textures, "lemon_hit.png"), 2, 2, 32),
  charge_hit: clipFromGrid(join(textures, "charge_hit.png"), 2, 2, 32),
  // Charge-up aura. These are GPUParticles2D textures in Player.tscn rather than
  // sprites, but the emitter is `amount = 1` with a 0.3s lifetime and a 4x4
  // particles_animation sheet (mat_chargeparticle.tres) — which is just a 16-frame
  // clip replayed every 0.3s. Drawn here as the animation it actually is.
  charge_1: clipFromGrid(join(textures, "charge_1.png"), 4, 4, CHARGE_FX_FPS),
  charge_2: clipFromGrid(join(textures, "charge_2.png"), 4, 4, CHARGE_FX_FPS),
  // Dash kick-up smoke: another SpriteEffect Sprite2D, 3x2 @ 24fps one-shot
  // (Player.tscn Dash/dash_particle).
  dash: clipFromGrid(join(textures, "dash.png"), 3, 2, 24),
};

/** Which sheet each clip draws from, so the renderer can pick the right image. */
const sheets = {
  lemon: "lemon.png",
  medium: "medium_shot.png",
  charged: "heavy_shot.png",
  lemon_hit: "lemon_hit.png",
  charge_hit: "charge_hit.png",
  charge_1: "charge_1.png",
  charge_2: "charge_2.png",
  dash: "dash.png",
};

writeFileSync(
  join(assets, "shot_anims.json"),
  JSON.stringify({ sheets, animations }, null, 2) + "\n",
);

for (const [src, dir] of [
  ["lemon.png", projectiles],
  ["medium_shot.png", projectiles],
  ["heavy_shot.png", projectiles],
  ["lemon_hit.png", textures],
  ["charge_hit.png", textures],
  ["charge_1.png", textures],
  ["charge_2.png", textures],
  ["dash.png", textures],
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
console.log("\nshot_anims.json + 8 sheets written to src/web/assets");
