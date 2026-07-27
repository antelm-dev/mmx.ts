import { assertAnimData, assertRegion, type Region } from "@mmx/contracts/animation";
import { assertTimedClip } from "@mmx/engine";
import {
  animData,
  enemyAnims as enemyAnimsJson,
  pickupAnims as pickupAnimsJson,
  shotAnims as shotAnimsJson,
} from "./generatedAssetJson.js";

/**
 * Every image the renderer draws from, and the clip tables that index into them.
 *
 * The sheets are keyed by their *file name* rather than by an import binding
 * because that is the key shot_anims.json already uses (scripts/build-shots.mjs
 * records which sheet each clip cuts from), so the whole set resolves through one
 * table instead of a variable per image.
 */
export const SHEET_URLS = {
  "x.png": new URL("../../assets/sprites/player/x.png", import.meta.url).href,
  "x_leftarm.png": new URL("../../assets/sprites/player/x_leftarm.png", import.meta.url).href,
  "lemon.png": new URL("../../assets/sprites/effects/lemon.png", import.meta.url).href,
  "medium_shot.png": new URL("../../assets/sprites/effects/medium_shot.png", import.meta.url).href,
  "heavy_shot.png": new URL("../../assets/sprites/effects/heavy_shot.png", import.meta.url).href,
  "dark_arrow.png": new URL("../../assets/sprites/effects/dark_arrow.png", import.meta.url).href,
  "lemon_hit.png": new URL("../../assets/sprites/effects/lemon_hit.png", import.meta.url).href,
  "charge_hit.png": new URL("../../assets/sprites/effects/charge_hit.png", import.meta.url).href,
  "charge_1.png": new URL("../../assets/sprites/effects/charge_1.png", import.meta.url).href,
  "charge_2.png": new URL("../../assets/sprites/effects/charge_2.png", import.meta.url).href,
  "dash.png": new URL("../../assets/sprites/effects/dash.png", import.meta.url).href,
  "explosion.png": new URL("../../assets/sprites/effects/explosion.png", import.meta.url).href,
  "remains.png": new URL("../../assets/sprites/effects/remains.png", import.meta.url).href,
  "x_bar.png": new URL("../../assets/sprites/hud/x_bar.png", import.meta.url).href,
  "hp_fill.png": new URL("../../assets/sprites/hud/hp_fill.png", import.meta.url).href,
  "weapon_bar.png": new URL("../../assets/sprites/hud/weapon_bar.png", import.meta.url).href,
  "weapon_icon_dark_arrow.png": new URL(
    "../../assets/sprites/hud/weapon_icon_dark_arrow.png",
    import.meta.url,
  ).href,
  "metool.png": new URL("../../assets/sprites/enemies/metool.png", import.meta.url).href,
  "sbat.png": new URL("../../assets/sprites/enemies/sbat.png", import.meta.url).href,
  "heal.png": new URL("../../assets/sprites/pickups/heal.png", import.meta.url).href,
  "sheal.png": new URL("../../assets/sprites/pickups/sheal.png", import.meta.url).href,
  "ammo.png": new URL("../../assets/sprites/pickups/ammo.png", import.meta.url).href,
  "sammo.png": new URL("../../assets/sprites/pickups/sammo.png", import.meta.url).href,
} as const satisfies Record<string, string>;

export type SheetName = keyof typeof SHEET_URLS;

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
