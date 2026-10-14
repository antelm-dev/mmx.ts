// MT Framework ARC v7 archives (both Legacy Collections; port of zero-x-mashup engine/src/arc.rs).
// "ARC\0", u16 version, u16 count, then count x 80-byte entries {name[64], u32 type hash, u32 compressed size,
// u32 size (low 29 bits), u32 offset}; data is zlib, or stored as is.
import { inflateSync } from "node:zlib";

export interface ArcEntry {
  name: string;
  typeHash: number;
  data: Buffer;
}

export function readArc(b: Buffer): ArcEntry[] {
  if (b.length < 8 || b.toString("latin1", 0, 4) !== "ARC\0") throw new Error("not an MT Framework ARC archive");
  return Array.from({ length: b.readUInt16LE(6) }, (_, i) => {
    const e = 8 + i * 80;
    const name = b.toString("latin1", e, e + 64).replace(/\0.*$/s, "");
    const blob = b.subarray(b.readUInt32LE(e + 76), b.readUInt32LE(e + 76) + b.readUInt32LE(e + 68));
    let data = blob;
    if (blob[0] === 0x78) {
      try {
        data = inflateSync(blob);
      } catch {
        // not zlib after all: keep the stored bytes, as arc.rs does
      }
    }
    return { name, typeHash: b.readUInt32LE(e + 64), data };
  });
}
