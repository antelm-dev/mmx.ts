// Mega Man X (SNES) Intro Highway reader: the MMX1 US v1.0 image inside the user's own RXC1.exe, kept in memory.
// Port of zero-x-mashup engine/src/mmx.rs + game/build_cache.py (format learned from MegaEdX, GPL-2.0, read only).
// Stage = scenes (256 px) -> blocks (32 px, 2x2 maps) -> maps (16 px, 2x2 tiles + 1 collision byte) -> 4bpp 8 px tiles.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Rgba } from "./png.js";

const P_LAYOUT = 0x868d24;
const P_SCENES = 0x868d93;
const P_BLOCKS = 0x868e02;
const P_MAPS = 0x868e71;
const P_COLLIS = 0x868ee0;
const P_CHECKP = 0x86a780;
const P_PALETT = 0x868133;
const P_GFXCFG = 0x86f56f;
const P_GFXPOS = 0x86f6f7;
const P_BG_LAYOUT = 0x868f4f;
const P_BG_SCENES = 0x868fbe;
const P_BG_BLOCKS = 0x86902d;
const DYN_TILES = 0x321d5; // PC offsets
const DYN_PAL = 0x32260;

const ROM_SIZE = 0x180000;
const HEADER = 0x7fc0;
const TITLE = Buffer.from("MEGAMAN X            ", "latin1");

export type Rgb = [number, number, number];

/** What `zero-x-mashup/game/cache/stage.json` holds (key order kept so JSON.stringify matches byte for byte). */
export interface Mmx1StageJson {
  cell: 16;
  w: number;
  h: number;
  spawn: [number, number];
  cameras: { x: number; min_x: number; max_x: number; min_y: number; max_y: number }[];
  backdrop: Rgb;
  collision: number[][];
}

export interface Mmx1Stage {
  stage: Rgba;
  background: Rgba;
  json: Mmx1StageJson;
}

/** The MMX1 US v1.0 image stored uncompressed inside RXC1.exe (the exe also holds v1.1 and the Japanese images). */
export function findMmx1Rom(exe: Uint8Array): Uint8Array | null {
  const buf = Buffer.from(exe.buffer, exe.byteOffset, exe.byteLength);
  for (let h = buf.indexOf(TITLE, HEADER); h >= 0; h = buf.indexOf(TITLE, h + 1)) {
    // LoROM/FastROM map byte 0x30, version byte 0
    if (buf[h + 0x15] === 0x30 && buf[h + 0x1b] === 0 && h - HEADER + ROM_SIZE <= buf.length) {
      return exe.subarray(h - HEADER, h - HEADER + ROM_SIZE);
    }
  }
  return null;
}

export function snes2pc(a: number): number {
  a &= 0xffffff;
  if (a >= 0x800000) a -= 0x800000;
  return (a >> 16) * 0x8000 + (a & 0x7fff);
}

/** SNES BGR555 to RGB888 (low 3 bits zero, as the Python oracle). */
export function snesColor(c: number): Rgb {
  return [(c & 0x1f) << 3, ((c >> 5) & 0x1f) << 3, ((c >> 10) & 0x1f) << 3];
}

/** MMX1 graphics RLE: per 8 output bytes, a control byte (1 bit = literal) and a fill byte. */
export function gfxRle(b: Uint8Array, src: number, size: number): Uint8Array {
  const out = new Uint8Array(size & ~7);
  let o = 0;
  for (let n = 0; n < size >> 3; n++) {
    let ctrl = b[src];
    const fill = b[src + 1];
    src += 2;
    for (let i = 0; i < 8; i++, ctrl <<= 1) out[o++] = ctrl & 0x80 ? b[src++] : fill;
  }
  return out;
}

/** Colour indices (0..15) of the 8x8 4bpp planar SNES tile `i`, row-major. */
export function tile4bpp(vram: Uint8Array, i: number): Uint8Array {
  const t = i * 32;
  const out = new Uint8Array(64);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const bit = (o: number) => (vram[t + o] >> (7 - x)) & 1;
      out[y * 8 + x] = bit(y * 2) | (bit(y * 2 + 1) << 1) | (bit(y * 2 + 16) << 2) | (bit(y * 2 + 17) << 3);
    }
  }
  return out;
}

/** Scene layout: w, h (in 256 px scenes), used, then {ctrl, scene} runs until 0xFF; ctrl bit 7 = repeat, else count up. */
export function decodeLayout(b: Uint8Array, lp: number): { w: number; h: number; layout: number[] } {
  const [w, h] = [b[lp], b[lp + 1]];
  const layout: number[] = [];
  for (lp += 3; b[lp] !== 0xff; lp += 2) {
    const ctrl = b[lp];
    let scene = b[lp + 1];
    for (let i = 0; i < (ctrl & 0x7f); i++) {
      layout.push(scene);
      if (!(ctrl & 0x80)) scene = (scene + 1) & 0xff;
    }
  }
  return { w, h, layout };
}

/** 16-bit SNES VRAM word address to a byte offset in our 32 KB BG VRAM; it wraps on the SNES side (MODLOG gotcha 1). */
export const vramDest = (word: number) => ((word << 1) - 0x2000) & 0xffff;

interface Layer {
  w: number;
  h: number;
  layout: number[];
  pal: Rgb[];
  vram: Uint8Array;
  scenes: number;
  blocks: number;
  maps: number;
  collis: number;
}

function reader(rom: Uint8Array) {
  const w = (pc: number) => rom[pc] | (rom[pc + 1] << 8);
  const l = (pc: number) => rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
  return { w, l, sw: (snes: number) => w(snes2pc(snes)), sl: (snes: number) => l(snes2pc(snes)) };
}

/** PC offset of a checkpoint: {objLoad, tileLoad, palLoad: u8; chX, chY, camX, camY, bkgX, bkgY, minX, maxX, minY, maxY: u16}. */
export function checkpointOffset(rom: Uint8Array, level: number, point: number): number {
  const { sw } = reader(rom);
  return snes2pc(P_CHECKP + sw(P_CHECKP + sw(P_CHECKP + level * 2) + point * 2));
}

function loadLayer(rom: Uint8Array, level: number, point: number, background: boolean): Layer {
  const { w, l, sw, sl } = reader(rom);
  const cp = checkpointOffset(rom, level, point);
  const [tileLoad, palLoad] = [rom[cp + 1], rom[cp + 2]];

  const pal: Rgb[] = Array.from({ length: 256 }, () => [0, 0, 0]);
  const cfg = snes2pc(sw(P_PALETT + level * 2 + 0x60) | 0x860000);
  const ppal = snes2pc(w(cfg + 1) | 0x850000);
  for (let i = 0; i < rom[cfg]; i++) pal[i] = snesColor(w(ppal + i * 2));
  for (let idx = w(DYN_PAL + w(DYN_PAL + level * 2) + palLoad * 2); w(DYN_PAL + idx) !== 0xffff; idx += 3) {
    const src = w(DYN_PAL + idx);
    const to = w(DYN_PAL + idx + 2) & 0xff;
    for (let i = 0; i < 16; i++) pal[to + i] = snesColor(w(snes2pc(0x850000 | (src + i * 2))));
  }

  const vram = new Uint8Array(0x8000);
  const put = (dest: number, data: Uint8Array) => {
    if (dest < vram.length) vram.set(data.subarray(0, vram.length - dest), dest);
  };
  const g = snes2pc(sw(P_GFXCFG + level * 2 + 4) | 0x860000);
  put(vramDest(w(g + 3)), gfxRle(rom, snes2pc(sl(P_GFXPOS + rom[g] * 5 + 2)), w(g + 1)));
  const main = w(DYN_TILES + w(DYN_TILES + level * 2) + tileLoad * 2);
  const dsize = w(DYN_TILES + main);
  if (dsize) {
    const dpos = snes2pc(l(DYN_TILES + main + 4));
    put(vramDest(w(DYN_TILES + main + 2)), rom.subarray(dpos, dpos + dsize));
  }

  const ptr = (table: number) => snes2pc(sl(table + level * 3));
  const [lt, st, bt] = background ? [P_BG_LAYOUT, P_BG_SCENES, P_BG_BLOCKS] : [P_LAYOUT, P_SCENES, P_BLOCKS];
  return { ...decodeLayout(rom, ptr(lt)), pal, vram, scenes: ptr(st), blocks: ptr(bt), maps: ptr(P_MAPS), collis: ptr(P_COLLIS) };
}

/** 16 px map index of every 16 px cell of the layer, rows of columns. */
function mapGrid(rom: Uint8Array, layer: Layer): number[][] {
  const { w } = reader(rom);
  const grid = Array.from({ length: layer.h * 16 }, () => new Array<number>(layer.w * 16).fill(0));
  for (let sy = 0; sy < layer.h; sy++) {
    for (let sx = 0; sx < layer.w; sx++) {
      const scene = layer.layout[sy * layer.w + sx] ?? 0;
      for (let by = 0; by < 8; by++) {
        for (let bx = 0; bx < 8; bx++) {
          const blk = w(layer.scenes + scene * 0x80 + by * 0x10 + bx * 2);
          for (let k = 0; k < 4; k++) grid[sy * 16 + by * 2 + (k >> 1)][sx * 16 + bx * 2 + (k & 1)] = w(layer.blocks + blk * 8 + k * 2);
        }
      }
    }
  }
  return grid;
}

/** RGBA pixels of the layer; colour index 0 of every tile stays transparent (the SNES backdrop shows there). */
function render(rom: Uint8Array, layer: Layer, grid: number[][]): Rgba {
  const { w } = reader(rom);
  const width = grid[0].length * 16;
  const height = grid.length * 16;
  const px = new Uint8Array(width * height * 4);
  const tiles = Array.from({ length: 0x400 }, (_, i) => tile4bpp(layer.vram, i));
  grid.forEach((row, my) =>
    row.forEach((m, mx) => {
      for (let k = 0; k < 4; k++) {
        const t = w(layer.maps + m * 8 + k * 2); // vhopppcc cccccccc
        const pix = tiles[t & 0x3ff];
        const palb = (t >> 6) & 0x70;
        const [ox, oy] = [mx * 16 + (k & 1) * 8, my * 16 + (k >> 1) * 8];
        for (let y = 0; y < 8; y++) {
          const sy = t & 0x8000 ? 7 - y : y;
          for (let x = 0; x < 8; x++) {
            const v = pix[sy * 8 + (t & 0x4000 ? 7 - x : x)];
            if (!v) continue;
            const o = ((oy + y) * width + ox + x) * 4;
            px.set(layer.pal[v | palb], o);
            px[o + 3] = 255;
          }
        }
      }
    }),
  );
  return { width, height, px };
}

/** Intro Highway (level 0): foreground and background art plus the stage.json data the project import reads. */
export function readMmx1Stage(rom: Uint8Array): Mmx1Stage {
  const { w } = reader(rom);
  const level = 0;
  const fg = loadLayer(rom, level, 0, false);
  const grid = mapGrid(rom, fg);
  const cp = checkpointOffset(rom, level, 0);
  // ponytail: level 0 has 4 checkpoints, as build_cache.py; read the count from the table to support other stages
  const cameras = [0, 1, 2, 3].map((point) => {
    const c = checkpointOffset(rom, level, point) + 3;
    const word = (i: number) => w(c + i * 2);
    return { x: word(0), min_x: word(6), max_x: word(7), min_y: word(8), max_y: word(9) };
  });
  const bg = loadLayer(rom, level, 0, true);
  return {
    stage: render(rom, fg, grid),
    background: render(rom, bg, mapGrid(rom, bg)),
    json: {
      cell: 16,
      w: grid[0].length,
      h: grid.length,
      spawn: [w(cp + 3), w(cp + 5)],
      cameras,
      backdrop: fg.pal[0],
      collision: grid.map((row) => row.map((m) => rom[fg.collis + m])),
    },
  };
}

/** Read RXC1.exe from a located Mega Man X Legacy Collection install (see findSteamGame("mmxlc")). */
export async function readMmx1Install(root: string): Promise<Mmx1Stage> {
  const rom = findMmx1Rom(await readFile(join(root, "RXC1.exe")));
  if (!rom) throw new Error("MMX1 (US v1.0) was not found inside RXC1.exe: unexpected Legacy Collection version.");
  return readMmx1Stage(rom);
}
