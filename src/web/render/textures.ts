import { Assets, Rectangle, Texture, TextureSource } from "pixi.js";
import type { Region } from "../../engine/Animation.js";
import { shotAnims } from "./assets.js";

/**
 * Sheet loading and the sub-textures cut out of them.
 *
 * Under Canvas 2D a sprite was a source rectangle passed to drawImage, resolved
 * fresh on every blit. On the GPU the rectangle is baked into a Texture — a view
 * onto the sheet's uploaded pixels — so each region is cut once and reused. Every
 * sprite that shares a sheet therefore also shares one GPU texture, which is what
 * lets the whole frame batch into a handful of draw calls.
 */

// Pixel art: nearest-neighbour sampling, never smoothing. Set on the global default
// rather than per-texture because it has to be in place *before* the first source is
// created — a source built under the linear default keeps it.
TextureSource.defaultOptions.scaleMode = "nearest";

const sheets = new Map<string, Texture>();
const regions = new Map<string, Texture>();

/** Load every sheet up front; the loop does not start until this resolves. */
export async function loadSheets(urls: Record<string, string>): Promise<void> {
  const names = Object.keys(urls);
  const loaded = await Promise.all(names.map((name) => Assets.load<Texture>(urls[name])));
  names.forEach((name, i) => sheets.set(name, loaded[i]));
}

/**
 * The texture for one region of a sheet, cut on first use and cached thereafter.
 * Keyed by sheet and rectangle, so two clips naming the same pixels share one.
 */
export function regionTexture(sheet: string, region: Region): Texture | null {
  const base = sheets.get(sheet);
  if (!base) return null;

  const [x, y, w, h] = region;
  if (w <= 0 || h <= 0) return null;

  const key = `${sheet}|${x},${y},${w},${h}`;
  let texture = regions.get(key);
  if (!texture) {
    texture = new Texture({ source: base.source, frame: new Rectangle(x, y, w, h) });
    regions.set(key, texture);
  }
  return texture;
}

/**
 * One frame of a shot/effect clip.
 *
 * `frame` is clamped rather than wrapped: the engine already wraps looping shot
 * spin, and a finished one-shot hit effect should hold its last frame, not restart.
 */
export function shotTexture(clipName: string, frame: number): Texture | null {
  const clip = shotAnims.animations[clipName];
  if (!clip || clip.frames.length === 0) return null;

  const idx = Math.max(0, Math.min(frame, clip.frames.length - 1));
  return regionTexture(shotAnims.sheets[clipName], clip.frames[idx].region);
}
