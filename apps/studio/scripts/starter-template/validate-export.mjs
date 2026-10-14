import { mkdtemp, readdir, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  exportFreshStarterCopy,
  validateStarterTemplateOnDisk,
} from "../../dist/starter-template/index.js";

async function dirSize(root) {
  let total = 0;
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      total += await dirSize(path);
    } else {
      total += (await stat(path)).size;
    }
  }
  return total;
}

const root = await mkdtemp(join(tmpdir(), "mmx-starter-validate-"));
const result = await exportFreshStarterCopy(root);
if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

const validation = await validateStarterTemplateOnDisk(root);
const bytes = await dirSize(root);

console.log(`EXPORT_ROOT=${root}`);
console.log(`ASSET_COUNTS=${JSON.stringify(validation.counts)}`);
console.log(`TOTAL_BYTES=${bytes}`);
