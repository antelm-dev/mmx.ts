import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  decodeLayout,
  decodePng,
  encodePng,
  findMmx1Rom,
  gfxRle,
  readMmx1Install,
  snes2pc,
  snesColor,
  tile4bpp,
  vramDest,
} from "../../src/project-io/node.js";

import { oracle } from "./oracle.js";

test("snes2pc maps LoROM/FastROM addresses", () => {
  assert.equal(snes2pc(0x008000), 0);
  assert.equal(snes2pc(0x868d24), 6 * 0x8000 + 0x0d24);
  assert.equal(snes2pc(0x068d24), snes2pc(0x868d24)); // FastROM mirror
});

test("snesColor expands BGR555", () => {
  assert.deepEqual(snesColor(0x7fff), [248, 248, 248]);
  assert.deepEqual(snesColor(0x001f | (2 << 5) | (3 << 10)), [248, 16, 24]);
});

test("vramDest wraps to 16 bits like the SNES", () => {
  assert.equal(vramDest(0x1800), 0x1000);
  assert.equal(vramDest(0x0800), 0xf000); // (0x1000 - 0x2000) & 0xFFFF: lands past our 32 KB VRAM
});

test("gfxRle mixes literals and fill bytes", () => {
  // ctrl 0b1010_0000: literal, fill, literal, then fill x5
  assert.deepEqual([...gfxRle(Uint8Array.from([0xa0, 0x77, 1, 2]), 0, 8)], [1, 0x77, 2, 0x77, 0x77, 0x77, 0x77, 0x77]);
});

test("tile4bpp reads the four bitplanes", () => {
  const vram = new Uint8Array(64);
  // tile 1, row 0: plane 0 = 0x80, plane 3 = 0x80 -> pixel (0,0) = 0b1001; plane 1 = 0x01 -> pixel (7,0) = 0b0010
  vram[32] = 0x80;
  vram[33] = 0x01;
  vram[32 + 17] = 0x80;
  const t = tile4bpp(vram, 1);
  assert.equal(t[0], 9);
  assert.equal(t[7], 2);
  assert.equal(t.reduce((a, b) => a + b, 0), 11);
});

test("decodeLayout expands counting and repeating runs", () => {
  // w=3 h=2 used=9; 0x03 from 5 counts up; 0x83 of 9 repeats; end
  assert.deepEqual(decodeLayout(Uint8Array.from([3, 2, 9, 0x03, 5, 0x83, 9, 0xff]), 0), { w: 3, h: 2, layout: [5, 6, 7, 9, 9, 9] });
});

test("findMmx1Rom picks the LoROM v1.0 header and skips others", () => {
  const exe = new Uint8Array(0x10 + 0x180000 * 2);
  const title = Buffer.from("MEGAMAN X            ", "latin1");
  const v11 = 0x10 + 0x7fc0;
  exe.set(title, v11);
  exe[v11 + 0x15] = 0x30;
  exe[v11 + 0x1b] = 1; // v1.1
  const v10 = 0x10 + 0x180000 + 0x7fc0;
  exe.set(title, v10);
  exe[v10 + 0x15] = 0x30;
  const rom = findMmx1Rom(exe);
  assert.equal(rom?.byteOffset, 0x10 + 0x180000);
  assert.equal(rom?.length, 0x180000);
  assert.equal(findMmx1Rom(new Uint8Array(0x10000)), null);
});

test("PNG encode/decode round-trips RGBA", () => {
  const img = { width: 3, height: 2, px: Uint8Array.from({ length: 24 }, (_, i) => i * 10) };
  assert.deepEqual(decodePng(encodePng(img)), img);
});

test("oracle: Intro Highway matches the Python cache", async (t) => {
  const o = await oracle(t, "mmxlc", ["stage.json", "stage.png", "background.png"]);
  if (!o) return;
  const { cache } = o;
  const { stage, background, json } = await readMmx1Install(o.install);
  assert.equal(JSON.stringify(json), readFileSync(join(cache, "stage.json"), "utf8"));
  for (const [name, img] of [["stage", stage], ["background", background]] as const) {
    const want = decodePng(readFileSync(join(cache, `${name}.png`)));
    assert.equal(`${img.width}x${img.height}`, `${want.width}x${want.height}`, name);
    assert.ok(Buffer.from(img.px).equals(Buffer.from(want.px)), `${name} pixels differ`);
  }
});
