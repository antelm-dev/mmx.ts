import { cpSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const templateAssets = join(here, "../../templates/mmx-starter/assets");
const coreResources = resolve(here, "../../../mmx-core-ts/resources");

if (!existsSync(coreResources)) {
  throw new Error(`Core resources not found at ${coreResources}`);
}

cpSync(join(coreResources, "sprites"), join(templateAssets, "sprites"), { recursive: true });
cpSync(join(coreResources, "sounds"), join(templateAssets, "sounds"), { recursive: true });
cpSync(join(coreResources, "fonts"), join(templateAssets, "fonts"), { recursive: true });
console.log(`Synced resources from ${coreResources} to ${templateAssets}`);
