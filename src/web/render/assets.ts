import type { Region } from '../../engine/Animation.js';
import animData from '../assets/x_anims.json';
import atlasUrl from '../assets/x.png';
import armAtlasUrl from '../assets/x_leftarm.png';
import shotAnimData from '../assets/shot_anims.json';
import lemonUrl from '../assets/lemon.png';
import mediumShotUrl from '../assets/medium_shot.png';
import heavyShotUrl from '../assets/heavy_shot.png';
import lemonHitUrl from '../assets/lemon_hit.png';
import chargeHitUrl from '../assets/charge_hit.png';
import charge1Url from '../assets/charge_1.png';
import charge2Url from '../assets/charge_2.png';

/**
 * Every image the renderer draws from, and the clip tables that index into them.
 *
 * The sheets are keyed by their *file name* rather than by an import binding
 * because that is the key shot_anims.json already uses (tools/build-shots.mjs
 * records which sheet each clip cuts from), so the whole set resolves through one
 * table instead of a variable per image.
 */
export const SHEET_URLS: Record<string, string> = {
  'x.png': atlasUrl,
  'x_leftarm.png': armAtlasUrl,
  'lemon.png': lemonUrl,
  'medium_shot.png': mediumShotUrl,
  'heavy_shot.png': heavyShotUrl,
  'lemon_hit.png': lemonHitUrl,
  'charge_hit.png': chargeHitUrl,
  'charge_1.png': charge1Url,
  'charge_2.png': charge2Url,
};

/**
 * The two player sheets have identical clips and frame indices: the normal set and
 * the arm-pointing set the game swaps in while the buster is out (Shot.gd). Which
 * one is drawn is decided by the engine's animation layer, not by the renderer.
 */
export const PLAYER_SHEETS = {
  normal: 'x.png',
  pointing_cannon: 'x_leftarm.png',
} as const;

/** Frame geometry: every player frame is 64x56 and the feet sit at local y=48. */
export const FRAME_W = 64;
export const FRAME_H = 56;

interface ShotAnimData {
  sheets: Record<string, string>;
  animations: Record<string, { loop: boolean; speed: number; frames: { region: Region }[] }>;
}

// JSON imports type each region as number[], which does not narrow to the
// fixed-length Region tuple on its own.
export const shotAnims = shotAnimData as unknown as ShotAnimData;
export { animData };
