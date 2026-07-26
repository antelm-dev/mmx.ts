import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const selfPath = fileURLToPath(import.meta.url);

export const FORBIDDEN_SPECIFIERS =
  /['"]@mmx\/(?:engine\/(?:game|core)|renderer-pixi\/render)(?:\/[^'"]*)?['"]/g;

const SKIP_SUFFIXES = ["scripts/check-forbidden-imports.mjs", "scripts/import-boundaries.test.mjs"];

export function findForbiddenImports(roots = ["apps", "packages", "scripts"]) {
  const hits = [];

  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name === "dist" || ent.name === ".turbo") continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|js|mjs|cjs)$/.test(ent.name)) continue;
      const rel = path.relative(root, full).replaceAll("\\", "/");
      if (SKIP_SUFFIXES.some((suffix) => rel.endsWith(suffix))) continue;
      const text = fs.readFileSync(full, "utf8");
      for (const match of text.matchAll(FORBIDDEN_SPECIFIERS)) {
        hits.push(`${rel}: ${match[0]}`);
      }
    }
  }

  for (const name of roots) walk(path.join(root, name));
  return hits;
}

const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === selfPath;

if (invokedDirectly) {
  const hits = findForbiddenImports();
  if (hits.length > 0) {
    console.error("Forbidden deep imports detected:\n" + hits.join("\n"));
    console.error(
      "\nUse @mmx/engine, @mmx/renderer-pixi, @mmx/content-schema, or @mmx/editor-runtime public entry points.",
    );
    process.exit(1);
  }
}
