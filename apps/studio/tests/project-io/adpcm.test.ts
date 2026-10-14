import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { msAdpcmToPcmWav, pcmWav } from "../../src/project-io/node.js";

// A one-block MS-ADPCM WAV with the 7 standard coefficient pairs.
function adpcmWav(ch: number, perBlock: number, block: Buffer): Buffer {
  const coef = [[256, 0], [512, -256], [0, 0], [192, 64], [240, 0], [460, -208], [392, -232]];
  const fmt = Buffer.alloc(22 + coef.length * 4);
  fmt.writeUInt16LE(2, 0);
  fmt.writeUInt16LE(ch, 2);
  fmt.writeUInt32LE(22050, 4);
  fmt.writeUInt16LE(block.length, 12);
  fmt.writeUInt16LE(4, 14);
  fmt.writeUInt16LE(perBlock, 18);
  fmt.writeUInt16LE(coef.length, 20);
  coef.forEach(([a, b], i) => (fmt.writeInt16LE(a, 22 + i * 4), fmt.writeInt16LE(b, 24 + i * 4)));
  const chunk = (id: string, body: Buffer) => {
    const h = Buffer.alloc(8);
    h.write(id, 0, "latin1");
    h.writeUInt32LE(body.length, 4);
    return Buffer.concat([h, body, Buffer.alloc(body.length & 1)]);
  };
  return Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), chunk("fmt ", fmt), chunk("data", block)]);
}
const samples = (pcm: Buffer) => Array.from({ length: (pcm.length - 44) / 2 }, (_, i) => pcm.readInt16LE(44 + i * 2));
// header: predictor[ch], delta[ch] (i16), sample1[ch] (i16), sample2[ch] (i16), then nibbles
function header(ch: number, preds: number[], deltas: number[], s1: number[], s2: number[]): Buffer {
  const b = Buffer.alloc(7 * ch);
  for (let c = 0; c < ch; c++) {
    b[c] = preds[c];
    b.writeInt16LE(deltas[c], ch + c * 2);
    b.writeInt16LE(s1[c], 3 * ch + c * 2);
    b.writeInt16LE(s2[c], 5 * ch + c * 2);
  }
  return b;
}

test("decodes MS-ADPCM with the predictor rounded toward zero", () => {
  // Coefficients (192, 64), s1 = -1, s2 = 0: the first prediction is -192 / 256 = -0.75 -> 0
  // (a >> 8 would give -1 and 15 below). Nibbles 1 then 0xf (-1), delta stays at its floor 16.
  const pcm = msAdpcmToPcmWav(adpcmWav(1, 4, Buffer.concat([header(1, [3], [16], [-1], [0]), Buffer.from([0x1f])])));
  assert.equal(pcm.toString("latin1", 0, 4), "RIFF");
  assert.deepEqual([pcm.readUInt16LE(20), pcm.readUInt16LE(22), pcm.readUInt32LE(24), pcm.readUInt16LE(34)], [1, 1, 22050, 16]);
  assert.deepEqual(samples(pcm), [0, -1, 16, -5]);
});

test("interleaves stereo nibbles left then right and stops at samples per block", () => {
  // Coefficients (256, 0): prediction = s1. Left 100 + 1 * 16, right -50 + 2 * 20.
  const block = Buffer.concat([header(2, [0, 0], [16, 20], [100, -50], [7, -7]), Buffer.from([0x12, 0x00])]);
  assert.deepEqual(samples(msAdpcmToPcmWav(adpcmWav(2, 3, block))), [7, -7, 100, -50, 116, -10]);
});

test("rejects non-ADPCM input", () => {
  assert.throws(() => msAdpcmToPcmWav(Buffer.from("not a wav at all")), /not a RIFF WAVE/);
  assert.throws(() => msAdpcmToPcmWav(pcmWav([1, 2], 1, 8000)), /not an MS-ADPCM WAV/);
});

// Reference: ffmpeg encodes a synthetic chirp to MS-ADPCM and decodes it back; our decoder must match it exactly.
test("matches ffmpeg sample for sample on a synthetic stereo fixture", async (t) => {
  if (spawnSync("ffmpeg", ["-version"]).status !== 0) {
    console.warn("[adpcm] SKIPPED ffmpeg reference: ffmpeg is not on PATH");
    return t.skip("ffmpeg is not on PATH");
  }
  const dir = await mkdtemp(join(tmpdir(), "mmx-adpcm-"));
  try {
    const ff = (...args: string[]) => assert.equal(spawnSync("ffmpeg", ["-v", "error", "-y", ...args]).status, 0, args.join(" "));
    const adpcm = join(dir, "chirp.wav");
    const ref = join(dir, "ref.wav");
    ff("-f", "lavfi", "-i", "aevalsrc=sin(2*PI*(200+2000*t)*t)*0.8|0.5*sin(2*PI*330*t):s=22050:d=0.5", "-c:a", "adpcm_ms", adpcm);
    ff("-i", adpcm, "-c:a", "pcm_s16le", "-f", "s16le", ref);
    const want = await readFile(ref);
    const got = msAdpcmToPcmWav(await readFile(adpcm));
    assert.equal(got.readUInt16LE(22), 2);
    assert.ok(want.length > 20000);
    assert.ok(got.subarray(44).equals(want), "PCM differs from ffmpeg");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
