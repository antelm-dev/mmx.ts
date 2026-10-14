import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { deflateSync } from "node:zlib";

import {
  PANTHEON_CLIPS,
  PANTHEON_SHOT_CLIP,
  decodePng,
  drawPieces,
  packAtlas,
  readArc,
  readFrames,
  readMmz1Install,
  readScripts,
  type Character,
} from "../../src/project-io/node.js";

import { oracle } from "./oracle.js";

function arc(files: [string, Buffer, boolean][]): Buffer {
  const head = Buffer.alloc(8 + files.length * 80);
  head.write("ARC\0", 0, "latin1");
  head.writeUInt16LE(7, 4);
  head.writeUInt16LE(files.length, 6);
  const blobs: Buffer[] = [];
  let off = head.length;
  files.forEach(([name, data, zip], i) => {
    const blob = zip ? deflateSync(data) : data;
    const e = 8 + i * 80;
    head.write(name, e, "latin1");
    head.writeUInt32LE(0x1234 + i, e + 64);
    head.writeUInt32LE(blob.length, e + 68);
    head.writeUInt32LE(data.length | 0x40000000, e + 72);
    head.writeUInt32LE(off, e + 76);
    blobs.push(blob);
    off += blob.length;
  });
  return Buffer.concat([head, ...blobs]);
}

test("readArc lists v7 entries and inflates zlib ones", () => {
  const entries = readArc(arc([["sound\\wav\\se_000", Buffer.from("RIFF zipped"), true], ["raw", Buffer.from("stored"), false]]));
  assert.deepEqual(
    entries.map((e) => [e.name, e.typeHash, e.data.toString()]),
    [["sound\\wav\\se_000", 0x1234, "RIFF zipped"], ["raw", 0x1235, "stored"]],
  );
  assert.throws(() => readArc(Buffer.from("NOPE0000")), /not an MT Framework ARC/);
});

test("readScripts stops each script at 0xFE (loop) or 0xFF (hold)", () => {
  // section: u32 4 -> table at 4: offsets 4, 10 (relative to the table)
  const d = Uint8Array.from([4, 0, 0, 0, 4, 0, 10, 0, 0, 6, 1, 6, 0, 0xfe, 2, 3, 2, 0xff]);
  assert.deepEqual(readScripts(d, 0), [[[0, 6], [1, 6], [0, 0xfe]], [[2, 3], [2, 0xff]]]);
});

test("readFrames reads streamed (u8 count, part) and object (u16 count) tables", () => {
  // two frames: frame 0 = 1 piece at +8, frame 1 = 0 pieces; piece tile 2, attr 0x10, x -8, y -16
  const streamed = Uint8Array.from([8, 0, 1, 3, 12, 0, 0, 0, 2, 0x10, 0xf8, 0xf0]);
  assert.deepEqual(readFrames(streamed, 0, true), [{ part: 3, pieces: [{ tile: 2, attr: 0x10, x: -8, y: -16 }] }, { part: 0, pieces: [] }]);
  const object = Uint8Array.from([8, 0, 1, 0, 12, 0, 0, 0, 2, 0x10, 0xf8, 0xf0]);
  assert.deepEqual(readFrames(object, 0, false)[0], { part: 0, pieces: [{ tile: 2, attr: 0x10, x: -8, y: -16 }] });
});

const pal = Array.from({ length: 16 }, (_, i) => [i * 16, 0, 0, 255] as [number, number, number, number]);
const at = (img: Uint8Array, x: number, y: number) => img[(y * 192 + x) * 4];

test("drawPieces places 4bpp tiles at the feet origin, flips, and keeps the first piece on top", () => {
  const tiles = new Uint8Array(32 * 8);
  tiles[0] = 0x21; // tile 0 row 0: pixel 0 = 1, pixel 1 = 2 (low nibble first)
  tiles[4 * 32] = 0x03; // tile 4 (piece tile 1) pixel 0 = 3
  const img = drawPieces(tiles, pal, [
    { tile: 1, attr: 0, x: 0, y: 0 }, // 8x8 on top of the next one
    { tile: 0, attr: 0x04, x: -7, y: 0 }, // 8x8 hflipped: pixel 0 lands at x = 7 - 7 = 0
  ]);
  assert.equal(at(img, 96, 144), 3 * 16); // first piece wins over the flipped one's pixel 0
  assert.equal(at(img, 95, 144), 2 * 16); // flipped pixel 1
  assert.equal(img[(144 * 192 + 97) * 4 + 3], 0);
});

test("packAtlas crops frames, wraps rows at 1024 px and keeps anchors", () => {
  const tiles = new Uint8Array(32 * 64).fill(0x11); // every pixel colour 1
  const big: Character = {
    parts: [tiles],
    frames: Array.from({ length: 17 }, () => ({ part: 0, pieces: [{ tile: 0, attr: 0x30, x: -32, y: -64 }] })), // 64x64 square
    pals: [pal],
    scripts: [[[0, 4], [0, 0xfe]]],
  };
  const { atlas, json } = packAtlas([[7, big]]);
  assert.equal(atlas.width, 1024);
  assert.equal(atlas.height, 128); // 16 x 64 px per row, the 17th wraps
  assert.deepEqual(json["7"].frames[0], [0, 0, 64, 64, 32, 64]);
  assert.deepEqual(json["7"].frames[16], [0, 64, 64, 64, 32, 64]);
  assert.deepEqual(json["7"].scripts, big.scripts);
});

test("oracle: Zero sprites match the Python cache; Pantheon and its shot resolve", async (t) => {
  const o = await oracle(t, "mzzxlc", ["zero.json", "zero.png", "../sheets/zero_moves.json"]);
  if (!o) return;
  const { root, cache } = o;
  const anims = JSON.parse(readFileSync(join(root, "game", "sheets", "zero_moves.json"), "utf8")).moves.map((m: { anim: number }) => m.anim);
  const { zero, objects } = await readMmz1Install(o.install, anims);
  assert.equal(JSON.stringify(zero.json), readFileSync(join(cache, "zero.json"), "utf8"));
  const want = decodePng(readFileSync(join(cache, "zero.png")));
  assert.equal(`${zero.atlas.width}x${zero.atlas.height}`, `${want.width}x${want.height}`);
  assert.ok(Buffer.from(zero.atlas.px).equals(Buffer.from(want.px)), "zero.png pixels differ");

  const pantheon = objects.json["25"];
  for (const clip of Object.values(PANTHEON_CLIPS)) {
    if ("script" in clip) assert.ok(pantheon.scripts[clip.script], `script ${clip.script}`);
    else for (const f of clip.frames) assert.ok(pantheon.frames[f], `frame ${f}`);
  }
  // the shot: 4 frames x 4/60 s, looping (what mmx.ts projectiles.pantheon_shot.animation assumes)
  assert.deepEqual(objects.json["1"].scripts[PANTHEON_SHOT_CLIP.script], [[22, 4], [23, 4], [25, 4], [24, 4], [0, 0xfe]]);
});
