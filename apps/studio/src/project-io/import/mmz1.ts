// Mega Man Zero (GBA) sprite reader: the user's own Mega Man Zero/ZX Legacy Collection banks
// RZZC/ZC/DATA/obj_fnt_z1.bin (tiles + palettes) and obj_dat_z1.bin (frames + scripts), plain files.
// Port of zero-x-mashup engine/src/mmz.rs + game/build_cache.py (formats in xz/MODLOG.md and docs/zero-import.md).
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Rgba } from "./png.js";

type Rgba8 = [number, number, number, number];

/** GBA OAM piece: tile (in units of 4 tiles), attr (shape << 6 | size << 4 | vflip 8 | hflip 4), x, y. */
export interface Piece {
  tile: number;
  attr: number;
  x: number;
  y: number;
}

/** A script step: [frame, duration in 1/60 s]; duration 0xFE loops to step `frame`, 0xFF holds. */
export type Step = [number, number];

export interface Character {
  parts: Uint8Array[]; // 4bpp tiles, one set per streamed part (static objects have one)
  frames: { part: number; pieces: Piece[] }[];
  pals: Rgba8[][];
  scripts: Step[][];
}

/** One animation of `zero.json`: frames [x, y, w, h, anchorX, anchorY] in the atlas, plus its scripts. */
export interface AtlasAnim {
  frames: [number, number, number, number, number, number][];
  scripts: Step[][];
}

/** An atlas and its JSON (`zero.json` shape), keyed by streamed animation index or object number. */
export interface SpriteAtlas {
  atlas: Rgba;
  json: Record<string, AtlasAnim>;
}

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
const s8 = (v: number) => (v << 24) >> 24;
const gbaColor = (c: number): Rgba8 => [(c & 0x1f) << 3, ((c >> 5) & 0x1f) << 3, ((c >> 10) & 0x1f) << 3, 255];
const palette = (b: Uint8Array, o: number): Rgba8[] => Array.from({ length: 16 }, (_, i) => gbaColor(u16(b, o + i * 2)));

/** Frame table at `base`: u16 count*4 first; entries {u16 piece offset, u8 count, u8 part} (objects: u16 count, part 0). */
export function readFrames(d: Uint8Array, base: number, streamed: boolean): Character["frames"] {
  return Array.from({ length: u16(d, base) >> 2 }, (_, i) => {
    const e = base + i * 4;
    const p = base + u16(d, e);
    const count = streamed ? d[e + 2] : u16(d, e + 2);
    const pieces = Array.from({ length: count }, (_, k) => ({ tile: d[p + k * 4], attr: d[p + k * 4 + 1], x: s8(d[p + k * 4 + 2]), y: s8(d[p + k * 4 + 3]) }));
    return { part: streamed ? d[e + 3] : 0, pieces };
  });
}

/** Script section at `sec`: u32 offset to a table of u16 offsets (relative to the table) to step lists. */
export function readScripts(d: Uint8Array, sec: number): Step[][] {
  const t = sec + u32(d, sec);
  return Array.from({ length: u16(d, t) >> 1 }, (_, i) => {
    const steps: Step[] = [];
    for (let p = t + u16(d, t + i * 2); ; p += 2) {
      steps.push([d[p], d[p + 1]]);
      if (d[p + 1] === 0xfe || d[p + 1] === 0xff) return steps;
    }
  });
}

/** All streamed characters of MMZ1 in bank order (Zero is 0..56): obj_fnt object 0 entries 64..484 paired with obj_dat layout blocks. */
export function loadStreamed(fnt: Uint8Array, dat: Uint8Array): Character[] {
  const top0 = u32(fnt, 0);
  const recs = [...new Set(Array.from({ length: 421 }, (_, i) => u32(fnt, top0 + (64 + i) * 4)).filter((o) => o < fnt.length))].sort((a, b) => a - b);
  const start = u32(dat, u32(dat, 0) + 64 * 4); // dofs[64]: first byte after the indexed layouts
  const isBlock = (o: number) => {
    const h = u32(dat, o);
    if (![8, 12, 16, 20, 24, 28].includes(h) || o + h + 4 > dat.length) return false;
    const offs = Array.from({ length: h / 4 }, (_, i) => u32(dat, o + i * 4));
    return offs.every((v, i) => i === 0 || offs[i - 1] < v) && offs[offs.length - 1] <= 0x4000 && u32(dat, o + h) === 4;
  };
  const blocks: number[] = [];
  for (let o = start; o < dat.length - 8; o += 4) if (isBlock(o)) blocks.push(o);
  if (blocks.length !== recs.length) {
    throw new Error(`MMZ1 banks: ${blocks.length} layout blocks for ${recs.length} streamed records (unexpected collection version?)`);
  }
  let lastPals: Rgba8[][] = [];
  return recs.map((rec, i) => {
    const c = streamedCharacter(fnt, dat, rec, blocks[i]);
    if (c.pals.length) lastPals = c.pals;
    else c.pals = lastPals; // only block 0 carries Zero's palettes (MODLOG gotcha 2)
    return c;
  });
}

// Record: n x 20-byte part headers {u32 data off, u32 size|flags, ...} then the parts' tiles back to back.
// Block: {u32 header length, section offsets...}; frame table at header length, scripts at section 1,
// a palette section {u16 n, u16 n, n x 16 colours} among sections 2.. (the last one found wins).
function streamedCharacter(b: Uint8Array, d: Uint8Array, rec: number, blk: number): Character {
  const n = u32(b, rec) / 20;
  let pos = rec + n * 20;
  const parts = Array.from({ length: n }, (_, k) => {
    const size = u32(b, rec + k * 20 + 4) & 0xffff;
    pos += size;
    return b.subarray(pos - size, pos);
  });
  const h = u32(d, blk);
  const hdr = Array.from({ length: h / 4 }, (_, i) => u32(d, blk + i * 4));
  const t = blk + h;
  let pals: Rgba8[][] = [];
  for (const so of hdr.slice(2)) {
    const p = blk + so;
    const c = u16(d, p);
    if (c === u16(d, p + 2) && c >= 1 && c <= 16) pals = Array.from({ length: c }, (_, q) => palette(d, p + 4 + q * 32));
  }
  return { parts, frames: readFrames(d, t + u32(d, t), true), pals, scripts: readScripts(d, blk + hdr[1]) };
}

/** A static object (enemy, prop, effect) of the 161-entry bank index: obj_fnt {u32 header, u32 size|flags, ...,
 * tiles, palettes}; obj_dat {u32 frame table off, u32 script section off}. */
export function loadObject(fnt: Uint8Array, dat: Uint8Array, obj: number): Character {
  const o = u32(fnt, obj * 4);
  const end = obj < 160 ? u32(fnt, (obj + 1) * 4) : fnt.length;
  const tilesAt = o + u32(fnt, o);
  const tilesEnd = tilesAt + (u32(fnt, o + 4) & 0xffff);
  const pals = Array.from({ length: Math.floor((end - tilesEnd) / 32) }, (_, p) => palette(fnt, tilesEnd + p * 32));
  const d = u32(dat, obj * 4);
  const t = d + u32(dat, d);
  return { parts: [fnt.subarray(tilesAt, tilesEnd)], frames: readFrames(dat, t + u32(dat, t), false), pals, scripts: readScripts(dat, d + u32(dat, d + 4)) };
}

const SIZES: [number, number][][] = [
  [[8, 8], [16, 16], [32, 32], [64, 64]], // square
  [[16, 8], [32, 8], [32, 16], [64, 32]], // wide
  [[8, 16], [8, 32], [16, 32], [32, 64]], // tall
];
export const CANVAS = 192;
export const ORIGIN = [96, 144] as const; // where a frame's (0, 0) lands: the character's feet

/** One frame assembled from its pieces on a 192x192 RGBA canvas (first piece on top; GBA 4bpp, low nibble first). */
export function drawPieces(tiles: Uint8Array, pal: Rgba8[], pieces: Piece[]): Uint8Array {
  const img = new Uint8Array(CANVAS * CANVAS * 4);
  for (const pc of [...pieces].reverse()) {
    const shape = pc.attr >> 6;
    if (shape > 2) continue;
    const [w, h] = SIZES[shape][(pc.attr >> 4) & 3];
    for (let ty = 0; ty < h / 8; ty++) {
      for (let tx = 0; tx < w / 8; tx++) {
        const t = (pc.tile * 4 + ty * (w / 8) + tx) * 32;
        if (t + 32 > tiles.length) continue;
        for (let py = 0; py < 8; py++) {
          for (let px = 0; px < 8; px++) {
            const v = (tiles[t + py * 4 + (px >> 1)] >> (4 * (px & 1))) & 15;
            if (!v) continue;
            const x = pc.attr & 4 ? w - 1 - (tx * 8 + px) : tx * 8 + px;
            const y = pc.attr & 8 ? h - 1 - (ty * 8 + py) : ty * 8 + py;
            const cx = ORIGIN[0] + pc.x + x;
            const cy = ORIGIN[1] + pc.y + y;
            if (cx >= 0 && cx < CANVAS && cy >= 0 && cy < CANVAS) img.set(pal[v], (cy * CANVAS + cx) * 4);
          }
        }
      }
    }
  }
  return img;
}

/** Bounding box [x0, y0, x1, y1) of the opaque pixels (PIL getbbox); an empty frame keeps one pixel at the origin. */
function bbox(img: Uint8Array): [number, number, number, number] {
  let [x0, y0, x1, y1] = [CANVAS, CANVAS, 0, 0];
  for (let y = 0; y < CANVAS; y++) {
    for (let x = 0; x < CANVAS; x++) {
      if (img[(y * CANVAS + x) * 4 + 3]) [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x + 1), Math.max(y1, y + 1)];
    }
  }
  return x1 ? [x0, y0, x1, y1] : [ORIGIN[0], ORIGIN[1], ORIGIN[0] + 1, ORIGIN[1] + 1];
}

/** Every frame of each set cropped and packed left to right in rows of at most 1024 px, drawn with palette 0. */
export function packAtlas(sets: [number, Character][]): SpriteAtlas {
  const cells: Rgba[] = [];
  const meta: [number, [number, number, number][], Step[][]][] = [];
  for (const [key, c] of sets) {
    const frames = c.frames.map(({ part, pieces }) => {
      const img = drawPieces(c.parts[part], c.pals[0], pieces);
      const [x0, y0, x1, y1] = bbox(img);
      const px = new Uint8Array((x1 - x0) * (y1 - y0) * 4);
      for (let y = y0; y < y1; y++) px.set(img.subarray((y * CANVAS + x0) * 4, (y * CANVAS + x1) * 4), (y - y0) * (x1 - x0) * 4);
      cells.push({ width: x1 - x0, height: y1 - y0, px });
      return [cells.length - 1, ORIGIN[0] - x0, ORIGIN[1] - y0] as [number, number, number];
    });
    meta.push([key, frames, c.scripts]);
  }
  let [x, y, rowh] = [0, 0, 0];
  const rects = cells.map((c) => {
    if (x + c.width > 1024) [x, y, rowh] = [0, y + rowh, 0];
    const r = [x, y] as const;
    x += c.width;
    rowh = Math.max(rowh, c.height);
    return r;
  });
  const atlas: Rgba = { width: 1024, height: y + rowh, px: new Uint8Array(1024 * (y + rowh) * 4) };
  cells.forEach((c, i) => {
    for (let row = 0; row < c.height; row++) atlas.px.set(c.px.subarray(row * c.width * 4, (row + 1) * c.width * 4), ((rects[i][1] + row) * 1024 + rects[i][0]) * 4);
  });
  const json: Record<string, AtlasAnim> = {};
  for (const [key, frames, scripts] of meta) {
    json[key] = { frames: frames.map(([i, ax, ay]) => [rects[i][0], rects[i][1], cells[i].width, cells[i].height, ax, ay]), scripts };
  }
  return { atlas, json };
}

/** Engine clip contract for the Pantheon sheet (mmx.ts#31): object 25 scripts / frames, object 1 script 4 for its shot. */
export const PANTHEON_OBJECT = 25;
export const EFFECTS_OBJECT = 1;
export const PANTHEON_CLIPS = {
  idle: { script: 0, loop: true },
  walk: { script: 1, loop: true },
  aim: { script: 2, loop: false },
  shoot: { script: 3, loop: true },
  // frames 17-19 (and 14) are death debris pieces, not flinch poses (seen in the game sheet), so hit stops at 16
  hit: { frames: [15, 16], loop: false },
} as const;
export const PANTHEON_SHOT_CLIP = { object: EFFECTS_OBJECT, script: 4, loop: true } as const;

export interface Mmz1Sprites {
  /** `zero.png` + `zero.json`, keyed by streamed animation index. */
  zero: SpriteAtlas;
  /** Pantheon (object 25) and effects (object 1) in one atlas, keyed by object number. */
  objects: SpriteAtlas;
}

export const MMZ1_DATA_DIR = join("nativePCx64", "RZZC", "ZC", "DATA");

/** Zero's animations `anims` (zero_moves.json `anim` values) and the Pantheon/effect objects from the two banks. */
export function readMmz1Sprites(fnt: Uint8Array, dat: Uint8Array, anims: readonly number[]): Mmz1Sprites {
  const chars = loadStreamed(fnt, dat);
  const keys = [...new Set(anims)].sort((a, b) => a - b);
  const missing = keys.filter((a) => !chars[a]);
  if (missing.length) throw new Error(`MMZ1 has no streamed animation ${missing.join(", ")} (0..${chars.length - 1})`);
  return {
    zero: packAtlas(keys.map((a) => [a, chars[a]])),
    objects: packAtlas([EFFECTS_OBJECT, PANTHEON_OBJECT].map((o) => [o, loadObject(fnt, dat, o)])),
  };
}

/** Read the banks from a located Mega Man Zero/ZX Legacy Collection install (see findSteamGame("mzzxlc")). */
export async function readMmz1Install(root: string, anims: readonly number[]): Promise<Mmz1Sprites> {
  const dir = join(root, MMZ1_DATA_DIR);
  const [fnt, dat] = await Promise.all([readFile(join(dir, "obj_fnt_z1.bin")), readFile(join(dir, "obj_dat_z1.bin"))]);
  return readMmz1Sprites(fnt, dat, anims);
}
