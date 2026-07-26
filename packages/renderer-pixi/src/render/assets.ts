import { assertAnimData, assertRegion, type Region } from "@mmx/asset-schema";
import { assertTimedClip } from "@mmx/engine";
import {
  animData,
  enemyAnims as enemyAnimsJson,
  pickupAnims as pickupAnimsJson,
  shotAnims as shotAnimsJson,
} from "./generatedAssetJson.js";

const assetUrl = (path: string) => new URL(`../../assets/${path}`, import.meta.url).href;

/**
 * Every image the renderer draws from, and the clip tables that index into them.
 *
 * The sheets are keyed by their *file name* rather than by an import binding
 * because that is the key shot_anims.json already uses (scripts/build-shots.mjs
 * records which sheet each clip cuts from), so the whole set resolves through one
 * table instead of a variable per image.
 */
export const SHEET_URLS: Record<string, string> = {
  "x.png": assetUrl("sprites/player/x.png"),
  "x_leftarm.png": assetUrl("sprites/player/x_leftarm.png"),
  "lemon.png": assetUrl("sprites/effects/lemon.png"),
  "medium_shot.png": assetUrl("sprites/effects/medium_shot.png"),
  "heavy_shot.png": assetUrl("sprites/effects/heavy_shot.png"),
  "dark_arrow.png": assetUrl("sprites/effects/dark_arrow.png"),
  "lemon_hit.png": assetUrl("sprites/effects/lemon_hit.png"),
  "charge_hit.png": assetUrl("sprites/effects/charge_hit.png"),
  "charge_1.png": assetUrl("sprites/effects/charge_1.png"),
  "charge_2.png": assetUrl("sprites/effects/charge_2.png"),
  "dash.png": assetUrl("sprites/effects/dash.png"),
  "explosion.png": assetUrl("sprites/effects/explosion.png"),
  "remains.png": assetUrl("sprites/effects/remains.png"),
  "x_bar.png": assetUrl("sprites/hud/x_bar.png"),
  "hp_fill.png": assetUrl("sprites/hud/hp_fill.png"),
  "weapon_bar.png": assetUrl("sprites/hud/weapon_bar.png"),
  "weapon_icon_dark_arrow.png": assetUrl("sprites/hud/weapon_icon_dark_arrow.png"),
  "metool.png": assetUrl("sprites/enemies/metool.png"),
  "sbat.png": assetUrl("sprites/enemies/sbat.png"),
  "heal.png": assetUrl("sprites/pickups/heal.png"),
  "sheal.png": assetUrl("sprites/pickups/sheal.png"),
  "ammo.png": assetUrl("sprites/pickups/ammo.png"),
  "sammo.png": assetUrl("sprites/pickups/sammo.png"),
};

/**
 * The two player sheets have identical clips and frame indices: the normal set and
 * the arm-pointing set the game swaps in while the buster is out (Shot.gd). Which
 * one is drawn is decided by the engine's animation layer, not by the renderer.
 */
export const PLAYER_SHEETS = {
  normal: "x.png",
  pointing_cannon: "x_leftarm.png",
} as const;

/** Frame geometry: every player frame is 64x56 and the feet sit at local y=48. */
export const FRAME_W = 64;
export const FRAME_H = 56;

interface ShotAnimData {
  sheets: Record<string, string>;
  animations: Record<
    string,
    { loop: boolean; speed: number; frames: { region: Region; duration: number }[] }
  >;
}

/**
 * The enemy clip tables, one AnimData per enemy kind (see scripts/build-enemies.mjs).
 *
 * Each kind cuts from a single sheet, so unlike the shot table — where one clip's
 * frames may come from any sheet — the sheet is recorded per actor rather than
 * per clip.
 */
interface EnemyAnimData {
  sheets: Record<string, string>;
  actors: Record<
    string,
    {
      sheet: string;
      animations: Record<
        string,
        { loop: boolean; speed: number; frames: { region: Region; duration: number }[] }
      >;
    }
  >;
}

/**
 * The Life Energy capsule clip tables — one AnimData per capsule kind (see
 * scripts/build-pickups.mjs). Same shape as {@link EnemyAnimData}: each kind
 * cuts from a single sheet.
 */
type PickupAnimData = EnemyAnimData;

export const shotAnims = shotAnimsJson as unknown as ShotAnimData;
export const enemyAnims = enemyAnimsJson as unknown as EnemyAnimData;
export const pickupAnims = pickupAnimsJson as unknown as PickupAnimData;
export { animData };

/** Validate generated JSON once at startup, before any malformed frame reaches Pixi. */
export function validateAnimationAssets(): void {
  assertAnimData(animData, "player animations");

  for (const [name, clip] of Object.entries(shotAnims.animations)) {
    assertTimedClip(clip, `shot animation '${name}'`);
    if (!shotAnims.sheets[name]) throw new Error(`shot animation '${name}' has no sheet`);
    clip.frames.forEach((frame, index) =>
      assertRegion(frame.region, `shot animation '${name}' frame ${index} region`),
    );
  }

  for (const [actorName, actor] of Object.entries(enemyAnims.actors)) {
    if (!actor.sheet) throw new Error(`enemy animation '${actorName}' has no sheet`);
    assertAnimData(actor, `enemy animations '${actorName}'`);
  }

  for (const [kind, actor] of Object.entries(pickupAnims.actors)) {
    if (!actor.sheet) throw new Error(`pickup animation '${kind}' has no sheet`);
    assertAnimData(actor, `pickup animations '${kind}'`);
  }
}
