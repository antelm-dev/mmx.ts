import { assertAnimData, assertRegion, type Region } from "@mmx/engine/engine/Animation.js";
import { assertTimedClip } from "@mmx/engine/core/AnimationCursor.js";
import animData from "../assets/x_anims.json";
import atlasUrl from "../assets/x.png";
import armAtlasUrl from "../assets/x_leftarm.png";
import shotAnimData from "../assets/shot_anims.json";
import lemonUrl from "../assets/lemon.png";
import mediumShotUrl from "../assets/medium_shot.png";
import heavyShotUrl from "../assets/heavy_shot.png";
import lemonHitUrl from "../assets/lemon_hit.png";
import chargeHitUrl from "../assets/charge_hit.png";
import charge1Url from "../assets/charge_1.png";
import charge2Url from "../assets/charge_2.png";
import dashUrl from "../assets/dash.png";
import xBarUrl from "../assets/x_bar.png";
import hpFillUrl from "../assets/hp_fill.png";
import enemyAnimData from "../assets/enemy_anims.json";
import metoolUrl from "../assets/metool.png";
import batUrl from "../assets/sbat.png";

/**
 * Every image the renderer draws from, and the clip tables that index into them.
 *
 * The sheets are keyed by their *file name* rather than by an import binding
 * because that is the key shot_anims.json already uses (tools/build-shots.mjs
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
  // Enemies, imported by tools/build-enemies.mjs.
  "metool.png": metoolUrl,
  "sbat.png": batUrl,
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
 * The enemy clip tables, one AnimData per enemy kind (see tools/build-enemies.mjs).
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

// JSON imports type each region as number[], which does not narrow to the
// fixed-length Region tuple on its own.
export const shotAnims = shotAnimData as unknown as ShotAnimData;
export const enemyAnims = enemyAnimData as unknown as EnemyAnimData;
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
}
