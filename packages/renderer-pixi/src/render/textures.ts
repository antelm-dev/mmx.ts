import { Assets, Rectangle, Texture, TextureSource } from "pixi.js";
import type { Region } from "@mmx/contracts/animation";
import type { ShotAnimManifest } from "../assets/manifest.js";

/**
 * Sheet loading and the sub-textures cut out of them.
 *
 * Under Canvas 2D a sprite was a source rectangle passed to drawImage, resolved
 * fresh on every blit. On the GPU the rectangle is baked into a Texture — a view
 * onto the sheet's uploaded pixels — so each region is cut once and reused. Every
 * sprite that shares a sheet therefore also shares one GPU texture, which is what
 * lets the whole frame batch into a handful of draw calls.
 */

TextureSource.defaultOptions.scaleMode = "nearest";

const sheets = new Map<string, Texture>();
const sheetSourceUrls = new Map<string, string>();
const regions = new Map<string, Texture>();

let loadInflight: Promise<void> | null = null;

function isTexture(value: unknown): value is Texture {
  return value instanceof Texture;
}

function assertSheetUrlCompatible(name: string, url: string): void {
  const existing = sheetSourceUrls.get(name);
  if (existing !== undefined && existing !== url) {
    throw new Error(
      `Renderer sheet key '${name}' is already loaded from '${existing}'; refusing to overwrite with '${url}'.`,
    );
  }
}

/** Load every missing sheet; concurrent callers share one in-flight load. */
export async function loadSheets(urls: Record<string, string>): Promise<void> {
  for (const [name, url] of Object.entries(urls)) {
    assertSheetUrlCompatible(name, url);
  }

  const pending = Object.entries(urls).filter(([name]) => !sheets.has(name));
  if (pending.length === 0) return;

  if (loadInflight) {
    await loadInflight;
    return loadSheets(urls);
  }

  loadInflight = (async () => {
    const stillPending = Object.entries(urls).filter(([name]) => !sheets.has(name));
    if (stillPending.length === 0) return;

    const loaded = await Promise.all(
      stillPending.map(async ([name, url]) => {
        let result: unknown;
        try {
          result = await Assets.load(url);
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new Error(`Failed to load renderer sheet '${name}' from '${url}': ${detail}`);
        }
        if (!isTexture(result)) {
          throw new Error(`Failed to load renderer sheet '${name}' from '${url}'`);
        }
        return [name, result, url] as const;
      }),
    );

    for (const [name, texture, url] of loaded) {
      assertSheetUrlCompatible(name, url);
      if (sheets.has(name)) {
        throw new Error(`Renderer sheet key '${name}' is already loaded; refusing to overwrite.`);
      }
      sheets.set(name, texture);
      sheetSourceUrls.set(name, url);
    }
  })();

  try {
    await loadInflight;
  } finally {
    loadInflight = null;
  }
}

export function resetTextureCacheForTests(): void {
  sheets.clear();
  sheetSourceUrls.clear();
  regions.clear();
  loadInflight = null;
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

/** How many sheets are loaded and how many sub-textures have been cut from them. */
export function textureCounts(): { sheets: number; regions: number } {
  return { sheets: sheets.size, regions: regions.size };
}

/**
 * One frame of a shot/effect clip.
 *
 * `frame` is clamped rather than wrapped: the engine already wraps looping shot
 * spin, and a finished one-shot hit effect should hold its last frame, not restart.
 */
export function shotTexture(
  clipName: string,
  frame: number,
  shotAnims: ShotAnimManifest,
): Texture | null {
  const clip = shotAnims.animations[clipName];
  if (!clip || clip.frames.length === 0) return null;

  const idx = Math.max(0, Math.min(frame, clip.frames.length - 1));
  return regionTexture(shotAnims.sheets[clipName], clip.frames[idx].region);
}
