import { assertAnimData, assertRegion, type Region } from "@mmx/engine/engine/Animation.js";
import { assertTimedClip } from "@mmx/engine/core/AnimationCursor.js";
import animDataJson from "../../../../resources/sprites/player/x_anims.json?raw";
import atlasUrl from "../../../../resources/sprites/player/x.png";
import armAtlasUrl from "../../../../resources/sprites/player/x_leftarm.png";
import shotAnimDataJson from "../../../../resources/sprites/effects/shot_anims.json?raw";
import lemonUrl from "../../../../resources/sprites/effects/lemon.png";
import mediumShotUrl from "../../../../resources/sprites/effects/medium_shot.png";
import heavyShotUrl from "../../../../resources/sprites/effects/heavy_shot.png";
import lemonHitUrl from "../../../../resources/sprites/effects/lemon_hit.png";
import chargeHitUrl from "../../../../resources/sprites/effects/charge_hit.png";
import charge1Url from "../../../../resources/sprites/effects/charge_1.png";
import charge2Url from "../../../../resources/sprites/effects/charge_2.png";
import dashUrl from "../../../../resources/sprites/effects/dash.png";
import xBarUrl from "../../../../resources/sprites/hud/x_bar.png";
import hpFillUrl from "../../../../resources/sprites/hud/hp_fill.png";
import enemyAnimDataJson from "../../../../resources/sprites/enemies/enemy_anims.json?raw";
import metoolUrl from "../../../../resources/sprites/enemies/metool.png";
import batUrl from "../../../../resources/sprites/enemies/sbat.png";
import pickupAnimDataJson from "../../../../resources/sprites/pickups/pickup_anims.json?raw";
import healUrl from "../../../../resources/sprites/pickups/heal.png";
import shealUrl from "../../../../resources/sprites/pickups/sheal.png";

/**
 * Every image the renderer draws from, and the clip tables that index into them.
 *
 * The sheets are keyed by their *file name* rather than by an import binding
 * because that is the key shot_anims.json already uses (scripts/build-shots.mjs
 * records which sheet each clip cuts from), so the whole set resolves through one
 * table instead of a variable per image.
 */
export const SHEET_URLS: Record<string, string> = {
  "x.png": atlasUrl,
  "x_leftarm.png": armAtlasUrl,
  "lemon.png": lemonUrl,
  "medium_shot.png": mediumShotUrl,
  "heavy_shot.png": heavyShotUrl,
  "lemon_hit.png": lemonHitUrl,
  "charge_hit.png": chargeHitUrl,
  "charge_1.png": charge1Url,
  "charge_2.png": charge2Url,
  "dash.png": dashUrl,
  // HUD furniture, from the original's src/HUD.
  "x_bar.png": xBarUrl,
  "hp_fill.png": hpFillUrl,
  // Enemies, imported by scripts/build-enemies.mjs.
  "metool.png": metoolUrl,
  "sbat.png": batUrl,
  // Life Energy capsules, imported by scripts/build-pickups.mjs.
  "heal.png": healUrl,
  "sheal.png": shealUrl,
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

// Raw imports keep shared resource JSON outside this package's TypeScript rootDir.
const animData: unknown = JSON.parse(animDataJson);
export const shotAnims = JSON.parse(shotAnimDataJson) as ShotAnimData;
export const enemyAnims = JSON.parse(enemyAnimDataJson) as EnemyAnimData;
export const pickupAnims = JSON.parse(pickupAnimDataJson) as PickupAnimData;
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
