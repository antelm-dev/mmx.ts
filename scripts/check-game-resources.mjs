import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const selfPath = fileURLToPath(import.meta.url);

const SCAN_ROOTS = ["apps", "packages", "scripts"];

const SKIP_DIR_NAMES = new Set(["node_modules", "dist", ".turbo"]);

const ALLOWED_REL_PREFIXES = [
  "docs/",
  "scripts/check-game-resources.mjs",
  "scripts/game-resource-guard.test.mjs",
  "docs/asset-project-migration/",
];

const FORBIDDEN_PATTERNS = [
  {
    name: "root resources/",
    regex: /(?:^|[^a-z])resources[/\\]/i,
  },
  {
    name: "builtin renderer catalog",
    regex: /createBuiltinRendererAssetManifest|builtinCatalog(?:\.js)?/,
  },
  {
    name: "builtin sound resolver",
    regex: /createBuiltinSoundResolver|builtinSoundResolver(?:\.js)?|\bSOUND_URLS\b/,
  },
  {
    name: "sync-assets mirror",
    regex: /sync-assets\.mjs|generatedAssetJson/,
  },
  {
    name: "hard-coded MMX font path",
    regex: /mega-man-x\.ttf/,
  },
  {
    name: "hard-coded MMX sprite path",
    regex:
      /sprites[/\\](?:player[/\\]x(?:_leftarm)?\.png|enemies[/\\]metool\.png|effects[/\\]lemon\.png)/,
  },
  {
    name: "hard-coded MMX sound path",
    regex: /sounds[/\\](?:player[/\\]jump\.wav|weapons[/\\]lemon\.wav)/,
  },
  {
    name: "package-local mirrored assets",
    regex: /\.\.\/\.\.\/assets[/\\](?:sprites|sounds)[/\\]/,
  },
];

function isAllowedFile(rel) {
  if (ALLOWED_REL_PREFIXES.some((prefix) => rel === prefix || rel.startsWith(prefix))) {
    return true;
  }
  if (/^(?:packages|apps)\/[^/]+\/tests\//.test(rel)) return true;
  return false;
}

function shouldSkipDir(full, entName) {
  if (SKIP_DIR_NAMES.has(entName)) return true;
  const rel = path.relative(root, full).replaceAll("\\", "/");
  if (/\/tests\/fixtures(?:\/|$)/.test(rel)) return true;
  if (rel.startsWith("packages/build-tools/tests/fixtures/")) return true;
  if (rel.startsWith("scripts/__fixtures__/import-boundaries/forbidden/")) return true;
  if (rel.startsWith("scripts/__fixtures__/game-resource-guard/")) return true;
  return false;
}

export function scanGameResourceText(text) {
  const hits = [];
  for (const { name, regex } of FORBIDDEN_PATTERNS) {
    if (regex.test(text)) hits.push(name);
  }
  return [...new Set(hits)];
}

export function findForbiddenGameResourceRefs(roots = SCAN_ROOTS) {
  const hits = [];

  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (shouldSkipDir(full, ent.name)) continue;
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|js|mjs|cjs|json|md)$/.test(ent.name)) continue;
      const rel = path.relative(root, full).replaceAll("\\", "/");
      if (isAllowedFile(rel)) continue;
      const text = fs.readFileSync(full, "utf8");
      for (const name of scanGameResourceText(text)) {
        hits.push(`${rel}: ${name}`);
      }
    }
  }

  for (const name of roots) walk(path.join(root, name));
  return [...new Set(hits)].sort();
}

const invokedDirectly = process.argv[1] !== undefined && path.resolve(process.argv[1]) === selfPath;

if (invokedDirectly) {
  const hits = findForbiddenGameResourceRefs();
  if (hits.length > 0) {
    console.error("Forbidden game resource references detected:\n" + hits.join("\n"));
    console.error(
      "\nCore no longer owns MMX game assets. Inject project manifests/resolvers or use isolated test fixtures.",
    );
    process.exit(1);
  }
}
