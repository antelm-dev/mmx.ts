import { execSync } from "node:child_process";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// The MMX Starter pack owns the enemy and pickup art (packages/pack-mmx-starter/assets + assets.json).
// This script rebuilds the pack's manifest fragment, then writes both templates: the shared
// assets (player, effects, HUD, sounds, font) read from mmx-starter, plus the pack's entries
// and a physical copy of its files, since Studio bundles the template and ships only out/**.
const here = dirname(fileURLToPath(import.meta.url));
const templatesRoot = join(here, "../../templates");
const starterRoot = join(templatesRoot, "mmx-starter");
const repoRoot = join(here, "../../../..");
const packRoot = join(repoRoot, "packages/pack-mmx-starter");
const TEMPLATES = ["mmx-starter", "mmx-demo"];

const readJson = (root, relativePath) => JSON.parse(readFileSync(join(root, relativePath), "utf8"));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
// Leave files as `pnpm fmt:check` wants them, so a run on unchanged sources changes nothing.
const format = (paths) =>
  execSync(`pnpm exec oxfmt ${paths.map((path) => relative(repoRoot, path)).join(" ")}`, {
    cwd: repoRoot,
    stdio: "inherit",
  });

const spriteSheets = [
  ["sprite.player.x", "assets/sprites/player/x.png"],
  ["sprite.player.x-leftarm", "assets/sprites/player/x_leftarm.png"],
  ["sprite.effects.charge-1", "assets/sprites/effects/charge_1.png"],
  ["sprite.effects.charge-2", "assets/sprites/effects/charge_2.png"],
  ["sprite.effects.charge-hit", "assets/sprites/effects/charge_hit.png"],
  ["sprite.effects.dark-arrow", "assets/sprites/effects/dark_arrow.png"],
  ["sprite.effects.dash", "assets/sprites/effects/dash.png"],
  ["sprite.effects.explosion", "assets/sprites/effects/explosion.png"],
  ["sprite.effects.heavy-shot", "assets/sprites/effects/heavy_shot.png"],
  ["sprite.effects.lemon", "assets/sprites/effects/lemon.png"],
  ["sprite.effects.lemon-hit", "assets/sprites/effects/lemon_hit.png"],
  ["sprite.effects.medium-shot", "assets/sprites/effects/medium_shot.png"],
  ["sprite.effects.remains", "assets/sprites/effects/remains.png"],
  ["sprite.hud.hp-fill", "assets/sprites/hud/hp_fill.png"],
  ["sprite.hud.weapon-bar", "assets/sprites/hud/weapon_bar.png"],
  ["sprite.hud.weapon-icon-dark-arrow", "assets/sprites/hud/weapon_icon_dark_arrow.png"],
  ["sprite.hud.x-bar", "assets/sprites/hud/x_bar.png"],
];

const packSpriteSheets = [
  ["sprite.enemies.metool", "assets/sprites/enemies/metool.png"],
  ["sprite.enemies.sbat", "assets/sprites/enemies/sbat.png"],
  ["sprite.pickups.ammo", "assets/sprites/pickups/ammo.png"],
  ["sprite.pickups.heal", "assets/sprites/pickups/heal.png"],
  ["sprite.pickups.sammo", "assets/sprites/pickups/sammo.png"],
  ["sprite.pickups.sheal", "assets/sprites/pickups/sheal.png"],
];

const sheetIdByFile = Object.fromEntries(
  spriteSheets.map(([id, path]) => [path.split("/").pop(), id]),
);

const sounds = [
  ["sfx.player.jump", "assets/sounds/player/jump.wav"],
  ["sfx.player.land", "assets/sounds/player/land.wav"],
  ["sfx.player.dash", "assets/sounds/player/dash.wav"],
  ["sfx.player.wallslide", "assets/sounds/player/wallslide.wav"],
  ["sfx.player.damage", "assets/sounds/player/damage.wav"],
  ["sfx.player.death", "assets/sounds/player/player-death.wav"],
  ["sfx.player.intro-appear", "assets/sounds/player/intro-appear.wav"],
  ["sfx.player.intro-thunder", "assets/sounds/player/intro-thunder.wav"],
  ["sfx.weapon.charge", "assets/sounds/weapons/charge.wav"],
  ["sfx.weapon.charge-max", "assets/sounds/weapons/charge-max.wav"],
  ["sfx.weapon.lemon", "assets/sounds/weapons/lemon.wav"],
  ["sfx.weapon.medium-shot", "assets/sounds/weapons/medium-shot.wav"],
  ["sfx.weapon.charged-shot", "assets/sounds/weapons/charged-shot.wav"],
  ["sfx.weapon.dark-arrow", "assets/sounds/weapons/dark-arrow.ogg"],
  ["sfx.enemy.hit", "assets/sounds/enemies/enemy-hit.wav"],
  ["sfx.enemy.shield-hit", "assets/sounds/enemies/shield-hit.ogg"],
  ["sfx.enemy.guard-break", "assets/sounds/enemies/guard-break.wav"],
  ["sfx.enemy.death", "assets/sounds/enemies/enemy-death.wav"],
  ["sfx.pickup.heal", "assets/sounds/pickups/heal.wav"],
];

const fonts = [["font.ui.mega-man-x", "assets/fonts/mega-man-x.ttf"]];

function spriteAsset(id, path) {
  return { id, kind: "sprite", path };
}

function soundAsset(id, path) {
  return { id, kind: "sound", path };
}

function fontAsset(id, path) {
  return { id, kind: "font", path };
}

function animationAsset(id, sheetAssetId, sheetPath, animations) {
  return { id, kind: "animation", path: sheetPath, sheetAssetId, animations };
}

const playerAnims = readJson(starterRoot, "assets/sprites/player/x_anims.json");
const enemyAnims = readJson(packRoot, "assets/sprites/enemies/enemy_anims.json");
const pickupAnims = readJson(packRoot, "assets/sprites/pickups/pickup_anims.json");
const shotAnims = readJson(starterRoot, "assets/sprites/effects/shot_anims.json");

const animationAssets = [
  animationAsset(
    "anim.player.x",
    "sprite.player.x",
    "assets/sprites/player/x.png",
    playerAnims.animations,
  ),
];

const byId = (a, b) => a.id.localeCompare(b.id);

const packAssets = [
  ...packSpriteSheets.map(([id, path]) => spriteAsset(id, path)),
  animationAsset(
    "anim.enemy.metool",
    "sprite.enemies.metool",
    "assets/sprites/enemies/metool.png",
    enemyAnims.actors.metool.animations,
  ),
  animationAsset(
    "anim.enemy.bat",
    "sprite.enemies.sbat",
    "assets/sprites/enemies/sbat.png",
    enemyAnims.actors.bat.animations,
  ),
  animationAsset(
    "anim.pickup.large",
    "sprite.pickups.heal",
    "assets/sprites/pickups/heal.png",
    pickupAnims.actors.large.animations,
  ),
  animationAsset(
    "anim.pickup.small",
    "sprite.pickups.sheal",
    "assets/sprites/pickups/sheal.png",
    pickupAnims.actors.small.animations,
  ),
  animationAsset(
    "anim.pickup.ammo",
    "sprite.pickups.ammo",
    "assets/sprites/pickups/ammo.png",
    pickupAnims.actors.ammo.animations,
  ),
  animationAsset(
    "anim.pickup.sammo",
    "sprite.pickups.sammo",
    "assets/sprites/pickups/sammo.png",
    pickupAnims.actors.sammo.animations,
  ),
].sort(byId);
writeJson(join(packRoot, "assets.json"), { assets: packAssets });
// Formatted before the templates copy it, so they get the same bytes.
format([join(packRoot, "assets.json"), join(packRoot, "assets")]);
console.log(`pack assets.json: ${packAssets.length} assets`);

for (const [clipName, clip] of Object.entries(shotAnims.animations)) {
  const sheetFile = shotAnims.sheets[clipName];
  const sheetAssetId = sheetIdByFile[sheetFile];
  if (!sheetAssetId) {
    throw new Error(`No sprite asset registered for shot sheet '${sheetFile}' (${clipName})`);
  }
  const sheetPath = spriteSheets.find(([id]) => id === sheetAssetId)?.[1];
  animationAssets.push(
    animationAsset(`anim.effect.${clipName}`, sheetAssetId, sheetPath, { [clipName]: clip }),
  );
}

const assets = [
  ...spriteSheets.map(([id, path]) => spriteAsset(id, path)),
  ...animationAssets,
  ...sounds.map(([id, path]) => soundAsset(id, path)),
  ...fonts.map(([id, path]) => fontAsset(id, path)),
  ...packAssets,
].sort(byId);

for (const name of TEMPLATES) {
  const root = join(templatesRoot, name);
  // Each template keeps its own identity, levels and pack marker; only the asset list is generated.
  const manifest = { ...readJson(root, "project.json"), assets };
  writeJson(join(root, "project.json"), manifest);
  cpSync(join(packRoot, "assets"), join(root, "assets"), { recursive: true });
  console.log(`${name}/project.json: ${assets.length} assets`);
}

format(TEMPLATES.map((name) => join(templatesRoot, name, "project.json")));
