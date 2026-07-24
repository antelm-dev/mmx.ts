/**
 * Builds resources/sprites/effects/shot_anims.json (+ copies the sheets) for buster shots,
 * Dark Arrow (the one ported sub-weapon so far), their hit effects, the charge-up
 * aura, and the enemy death burst.
 *
 * Four different sources, because the Godot project stores them four ways:
 *
 *  - The projectiles (lemon / medium_shot / heavy_shot) are Aseprite sheets with a
 *    sibling .json describing every frame's region and duration, exactly like x.json.
 *    Those are read frame-for-frame.
 *
 *  - The hit effects (lemon_hit / charge_hit / explosion / remains) have no .json:
 *    they are plain Sprite2D sheets sliced by `hframes`/`vframes` — in Basic
 *    Hit.tscn / Big Hit.tscn (2x2 each) or the equivalent GPUParticles2D
 *    CanvasItemMaterial for explosion/remains — and played at their own
 *    `animation_speed`. Their frame grid is derived from the PNG's own
 *    dimensions, read out of the IHDR chunk so the script stays dependency-free.
 *
 *  - Dark Arrow has no Aseprite sidecar and isn't a grid either: DarkArrow.tscn
 *    cuts two fixed AtlasTexture regions out of one 32x32 sheet by hand (a
 *    "default" and a "hit" pose swapped on collision). Only the first is ported
 *    — see DARK_ARROW_SHOT in core/constants.ts — so it is read as one static
 *    region rather than a real clip.
 *
 * Usage:  node scripts/build-shots.mjs [path-to-godot-project]
 */
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const godot = resolve(repo, process.argv[2] ?? "../Mega-Man-X8-16-bit");
const projectiles = join(godot, "src/Actors/Weapons/Projectiles");
const textures = join(godot, "src/Effects/Textures");
const darkArrow = join(godot, "src/Actors/Player/BossWeapons/DarkArrow");
const assets = join(repo, "resources/sprites/effects");

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

/**
 * A single fixed AtlasTexture region, played as a one-frame "clip" — DarkArrow.tscn's
 * `animatedSprite` swaps between two such regions of dark_arrow.png ("default" and a
 * "hit" pose neither ported here, see DARK_ARROW_SHOT in core/constants.ts) rather
 * than spinning through a sheet like the buster's shots.
 */
function clipFromRegion(region, fps) {
  return { loop: true, speed: fps, frames: [{ region, duration: 1 }] };
}

// The 16 frames of the charge aura are spread across the emitter's 0.3s particle
// lifetime (Player.tscn ChargingParticle), so the sheet's effective rate is fixed
// by that lifetime rather than by an authored fps.
const CHARGE_FX_FPS = 16 / 0.3;

const animations = {
  // Buster projectiles. Names match ShotKind in packages/engine/src/game/Projectile.ts.
  lemon: clipFromAseprite(join(projectiles, "lemon.json")),
  medium: clipFromAseprite(join(projectiles, "medium_shot.json")),
  charged: clipFromAseprite(join(projectiles, "heavy_shot.json")),
  // Dark Arrow (Dark Mantis's sub-weapon): a static sprite, not a spin loop —
  // DarkArrow.tscn's AtlasTexture region 13, the "default" (in-flight) pose.
  dark_arrow: clipFromRegion([0, 0, 32, 16], 5),
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
  // Enemy death burst: EnemyDeath's "Explosion Particles" GPUParticles2D, 4x4
  // particles_animation, one-shot (Shared/QuickEnemyDeath.tscn /
  // Effects/Explosion Particles.tscn). The sheet is played by
  // ExplosionParticles.tres' anim_speed_curve, which starts at 3x and decays to
  // 0 over the particle's 2s lifetime rather than a flat fps — there is no flat
  // rate to read off it, so 24fps here is chosen to read as a quick, snappy pop
  // rather than replicate the curve's slow tail.
  explosion: clipFromGrid(join(textures, "explosion.png"), 4, 4, 24),
  // Enemy death debris: EnemyDeath's "Remains/remains_particles" GPUParticles2D,
  // 6x3 particles_animation (Shared/QuickEnemyDeath.tscn). Each chunk shows one
  // still icon for its whole flight rather than animating — RemainsParticle.tres
  // sets no anim_speed, only a random per-particle anim_offset — so this clip is
  // only ever used to pick a single frame, never advanced.
  remains: clipFromGrid(join(textures, "remains.png"), 6, 3, 1),
};

/** Which sheet each clip draws from, so the renderer can pick the right image. */
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
console.log(`\nshot_anims.json + ${Object.keys(sheets).length} sheets written to resources/sprites/effects`);
