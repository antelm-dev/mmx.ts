import { createHash } from "node:crypto";
import path from "node:path";

export function hashContent(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function hashedAssetFileName(contentHash: string, logicalPath: string): string {
  const ext = path.posix.extname(logicalPath);
  const short = contentHash.slice(0, 16);
  return `${short}${ext}`;
}
