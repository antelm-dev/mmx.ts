// Microsoft ADPCM (WAV format 2) -> 16-bit PCM WAV, for the MMZ1 sound effects in Zero1SE.arc.
// Port of zero-x-mashup engine/src/audio.rs, which matches ffmpeg sample for sample.

const ADAPT = [230, 230, 230, 230, 307, 409, 512, 614, 768, 614, 512, 409, 307, 230, 230, 230];

/** RIFF chunks by id. */
function riffChunks(wav: Buffer): Record<string, Buffer> {
  if (wav.toString("latin1", 0, 4) !== "RIFF" || wav.toString("latin1", 8, 12) !== "WAVE") throw new Error("not a RIFF WAVE file");
  const chunks: Record<string, Buffer> = {};
  for (let p = 12; p + 8 <= wav.length; ) {
    const size = wav.readUInt32LE(p + 4);
    chunks[wav.toString("latin1", p, p + 4)] = wav.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size & 1);
  }
  return chunks;
}

/** A 16-bit PCM WAV file of interleaved samples. */
export function pcmWav(samples: ArrayLike<number>, channels: number, rate: number): Buffer {
  const out = Buffer.alloc(44 + samples.length * 2);
  out.write("RIFF", 0, "latin1");
  out.writeUInt32LE(36 + samples.length * 2, 4);
  out.write("WAVEfmt ", 8, "latin1");
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(channels, 22);
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * channels * 2, 28);
  out.writeUInt16LE(channels * 2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36, "latin1");
  out.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) out.writeInt16LE(samples[i], 44 + i * 2);
  return out;
}

/**
 * Decode an MS-ADPCM WAV. Gotcha: the predictor divides by 256 rounding toward zero, as Microsoft's
 * reference does; `>> 8` floors negatives and drifts (MODLOG gotcha 4).
 */
export function msAdpcmToPcmWav(wav: Buffer): Buffer {
  const { "fmt ": fmt, data } = riffChunks(wav);
  if (!fmt || !data || fmt.readUInt16LE(0) !== 2) throw new Error("not an MS-ADPCM WAV");
  const ch = fmt.readUInt16LE(2);
  const rate = fmt.readUInt32LE(4);
  const align = fmt.readUInt16LE(12);
  const perBlock = fmt.readUInt16LE(18);
  const coef = Array.from({ length: fmt.readUInt16LE(20) }, (_, i) => [fmt.readInt16LE(22 + i * 4), fmt.readInt16LE(24 + i * 4)]);
  const pcm: number[] = [];
  for (let b = 0; b + 7 * ch <= data.length; b += align) {
    const block = data.subarray(b, b + align);
    // header: predictor[ch], delta[ch], sample1[ch], sample2[ch]
    const c1: number[] = [], c2: number[] = [], delta: number[] = [], s1: number[] = [], s2: number[] = [];
    for (let c = 0; c < ch; c++) {
      const pair = coef[block[c]];
      if (!pair) throw new Error(`MS-ADPCM predictor ${block[c]} out of range`);
      [c1[c], c2[c]] = pair;
      delta[c] = block.readInt16LE(ch + c * 2);
      s1[c] = block.readInt16LE(3 * ch + c * 2);
      s2[c] = block.readInt16LE(5 * ch + c * 2);
    }
    const out = [...s2, ...s1];
    let c = 0;
    for (const byte of block.subarray(7 * ch)) {
      for (const nib of [byte >> 4, byte & 15]) {
        const pred = Math.trunc((s1[c] * c1[c] + s2[c] * c2[c]) / 256) + (nib >= 8 ? nib - 16 : nib) * delta[c];
        const v = Math.min(Math.max(pred, -32768), 32767);
        s2[c] = s1[c];
        s1[c] = v;
        delta[c] = Math.max((ADAPT[nib] * delta[c]) >> 8, 16);
        out.push(v);
        c = (c + 1) % ch;
      }
    }
    for (const v of out.slice(0, perBlock * ch)) pcm.push(v);
  }
  return pcmWav(pcm, ch, rate);
}
