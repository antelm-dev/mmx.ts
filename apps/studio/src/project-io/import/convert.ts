// Pure conversions from the reader formats (zero.json, stage.json shapes) to Studio project formats.
// Formats and the mapping are documented in docs/zero-import.md.
import { VIEW_HEIGHT, VIEW_WIDTH } from "@mmx/engine";

import type { Step } from "./mmz1.js";
import type { Rgba } from "./png.js";

const LOOP = 0xfe;
const HOLD = 0xff;

/** TerrainTile values from @mmx/contracts/terrain (on-disk ids). */
export const Tile = { Empty: 0, Solid: 1, SlopeUpRight: 2, SlopeUpLeft: 3, OneWay: 4 } as const;

// renderer-pixi draws the sprite centre at feet - body_hh - 4 (renderer-pixi/src/render/sprite.ts,
// SPRITE_OFFSET_Y) with body_hh = 15 for player.zero (engine/src/data/actors.ts), so the
// anchor (Zero's feet) sits 15 + 4 below the cell centre.
export const FEET_BELOW_CENTRE = 19;

export type Region = [number, number, number, number];
/** An atlas frame: [x, y, w, h, anchorX, anchorY]. */
export type Frame = [number, number, number, number, number, number];

export interface Clip {
  loop: boolean;
  loopStart?: number;
  speed: number;
  frames: { duration: number; region: Region }[];
}

/** "intro" = steps before the loop target, "first" = first step only, "once" = all steps without looping. */
export type ClipMode = "intro" | "first" | "once";

/**
 * MMZ animation script -> steps. A script is [[frame, duration in 1/60 s], ...] ended by
 * [k, 0xfe] (loop back to step k) or [_, 0xff] (hold the last step).
 * `loopStart` is k for a looping script, else 0.
 */
export function splitScript(script: Step[]): {
  steps: { frame: number; duration: number }[];
  loop: boolean;
  loopStart: number;
} {
  const end = script.findIndex(([, d]) => d === LOOP || d === HOLD);
  const steps = (end < 0 ? script : script.slice(0, end)).map(([frame, duration]) => ({
    frame,
    duration,
  }));
  if (steps.some((s) => s.duration <= 0))
    throw new Error(`script has a zero-length step: ${JSON.stringify(script)}`);
  if (end < 0 || script[end][1] === HOLD) return { steps, loop: false, loopStart: 0 };
  const k = script[end][0];
  if (k >= steps.length)
    throw new Error(`loop target ${k} out of range: ${JSON.stringify(script)}`);
  return { steps, loop: true, loopStart: k };
}

/**
 * Script -> AnimationClip. Durations stay in 1/60 s with speed 60 (AnimationCursor holds a
 * frame for duration / speed seconds). `regionOf(frame)` gives the sheet cell. A loop to
 * step k > 0 keeps every step and sets `loopStart: k`. The non-steady modes are one-shots,
 * which the abilities need where they wait for animation_finished.
 */
export function toClip(script: Step[], regionOf: (frame: number) => Region, mode?: ClipMode): Clip {
  const { steps: all, loop: loops, loopStart } = splitScript(script);
  const steps =
    mode === "intro" ? all.slice(0, loopStart) : mode === "first" ? all.slice(0, 1) : all;
  if (steps.length === 0) throw new Error(`no steps for mode ${mode}: ${JSON.stringify(script)}`);
  const loop = mode === undefined && loops;
  return {
    loop,
    ...(loop && loopStart > 0 && { loopStart }),
    speed: 60,
    frames: steps.map((s) => ({ duration: s.duration, region: regionOf(s.frame) })),
  };
}

/**
 * MMX1 collision byte -> [TerrainTile, slope profile?]. Profiles are [left, right] fill heights
 * in px from the tile base. 0x05-0x08 rise 4 px per tile left to right, 0x09-0x0c are their
 * mirror. 0x34/0x35 (walkable top) are OneWay; everything else non-zero (0x39/0x3a, 0x3b solid) is Solid.
 */
export function tileOf(byte: number): [number, [number, number]?] {
  if (byte === 0) return [Tile.Empty];
  if (byte === 0x34 || byte === 0x35) return [Tile.OneWay];
  if (byte >= 0x05 && byte <= 0x08) {
    const i = byte - 0x05;
    return [Tile.SlopeUpRight, [i * 4, i * 4 + 4]];
  }
  if (byte >= 0x09 && byte <= 0x0c) {
    const i = byte - 0x09;
    return [Tile.SlopeUpLeft, [i * 4 + 4, i * 4]];
  }
  return [Tile.Solid];
}

/** Smallest even cell that holds every frame with its anchor `feetBelow` px under the cell centre (mirrored or not). */
export function cellSize(frames: Frame[], feetBelow = FEET_BELOW_CENTRE): { w: number; h: number } {
  let half = 0,
    up = 0,
    down = 0;
  for (const [, , w, h, ax, ay] of frames) {
    half = Math.max(half, ax, w - ax);
    up = Math.max(up, ay);
    down = Math.max(down, h - ay);
  }
  return { w: 2 * half, h: 2 * Math.max(up - feetBelow, down + feetBelow) };
}

/**
 * Where a frame's top-left goes inside its cell so its anchor lands at (cell.w / 2, cell.h / 2 + feetBelow).
 * GBA frames face left: `mirror` flips the frame (and its anchor) for sheets the engine expects facing right.
 */
export function placeInCell(
  [, , w, , ax, ay]: Frame,
  cell: { w: number; h: number },
  feetBelow = FEET_BELOW_CENTRE,
  mirror = true,
): { dx: number; dy: number } {
  return { dx: cell.w / 2 - (mirror ? w - ax : ax), dy: cell.h / 2 + feetBelow - ay };
}

/** Every frame copied from the atlas into one fixed cell, 16 cells per row; regions in frame order. */
export function packFrames(
  atlas: Rgba,
  frames: Frame[],
  feetBelow: number,
  mirror: boolean,
): { sheet: Rgba; regions: Region[]; cell: { w: number; h: number } } {
  const cell = cellSize(frames, feetBelow);
  const COLS = 16;
  const width = COLS * cell.w;
  const height = Math.ceil(frames.length / COLS) * cell.h;
  const sheet = { width, height, px: new Uint8Array(width * height * 4) };
  const regions = frames.map((frame, n) => {
    const cx = (n % COLS) * cell.w;
    const cy = Math.floor(n / COLS) * cell.h;
    const [fx, fy, w, h] = frame;
    const { dx, dy } = placeInCell(frame, cell, feetBelow, mirror);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = ((fy + y) * atlas.width + fx + (mirror ? w - 1 - x : x)) * 4;
        sheet.px.set(atlas.px.subarray(s, s + 4), ((cy + dy + y) * width + cx + dx + x) * 4);
      }
    }
    return [cx, cy, cell.w, cell.h] as Region;
  });
  return { sheet, regions, cell };
}

/**
 * The Intro Highway art as level image layers. `stage.png` is the foreground painting,
 * world-locked; `background.png` scrolls at half speed (MMX1 shifts it by camX / 2, and
 * its y stays 0 on the highway). `backdrop` is palette colour 0 as [r, g, b].
 */
export function introHighwayArt(backdrop: number[]) {
  const hex = backdrop.map((c) => c.toString(16).padStart(2, "0")).join("");
  return {
    imageLayers: [
      {
        id: "art-background",
        assetId: "image.background",
        x: 0,
        y: 0,
        parallax: 0.5,
        layer: "background" as const,
      },
      {
        id: "art-stage",
        assetId: "image.stage",
        x: 0,
        y: 0,
        parallax: 1,
        layer: "world-back" as const,
      },
    ],
    backdrop: `#${hex}`,
  };
}

export interface CameraLimits {
  x: number;
  min_x: number;
  max_x: number;
  min_y: number;
  max_y: number;
}

/**
 * Checkpoint camera limits -> `camera-zone` objects. MMX limits bound the view's top-left
 * corner (min..max), a CameraZone bounds the whole view, so the far edges add the engine's
 * view size (that puts its pit line, zone bottom + 32, where MMX's is). Consecutive
 * checkpoints with the same limits are one section, one zone: the engine binds the view to
 * the zone the player is in, so cutting identical limits would only shove the view at each
 * seam. Zones must not overlap, else the engine's hysteresis, not the stage, decides.
 */
export function cameraZones(cameras: CameraLimits[], worldW: number, worldH: number) {
  const same = (a: CameraLimits, b: CameraLimits) =>
    a.min_x === b.min_x && a.max_x === b.max_x && a.min_y === b.min_y && a.max_y === b.max_y;
  const zones: {
    id: string;
    definitionId: "camera-zone";
    x: number;
    y: number;
    width: number;
    height: number;
  }[] = [];
  cameras.forEach((c, i) => {
    if (i > 0 && same(c, cameras[i - 1])) return;
    zones.push({
      id: `camera-checkpoint-${i}`,
      definitionId: "camera-zone",
      x: c.min_x,
      y: c.min_y,
      width: Math.min(c.max_x + VIEW_WIDTH, worldW) - c.min_x,
      height: Math.min(c.max_y + VIEW_HEIGHT, worldH) - c.min_y,
    });
  });
  for (const [i, a] of zones.entries()) {
    for (const b of zones.slice(i + 1)) {
      const apart =
        a.x + a.width <= b.x ||
        b.x + b.width <= a.x ||
        a.y + a.height <= b.y ||
        b.y + b.height <= a.y;
      if (!apart) throw new Error(`camera zones ${a.id} and ${b.id} overlap`);
    }
  }
  return zones;
}

/** X clip name -> [Zero move, mode]: the clips X's abilities play. Fallbacks are listed in docs/zero-import.md. */
export const X_CLIPS: Record<string, [string, ClipMode?]> = {
  idle: ["idle"],
  weak: ["idle"],
  recover: ["idle", "first"],
  walk_start: ["run", "intro"],
  walk: ["run"],
  jump: ["jump"],
  fall: ["fall"],
  dash: ["dash"],
  slide: ["wall_slide"],
  walljump: ["wall_jump"],
  damage: ["hurt"],
  beam: ["fall"],
  beam_in: ["land", "once"],
  beam_equip: ["idle", "once"],
};

/**
 * Sound role -> engine sound id (@mmx/browser-audio GAMEPLAY_SOUND_IDS, plus the optional
 * `slash`). Roles with no engine id (enemy_shot, wall_kick) are left out.
 */
export const SOUND_ROLES: Record<string, string> = {
  slash: "slash",
  dash: "dash",
  land: "land",
  buster_shot: "lemon",
  hurt: "damage",
};
