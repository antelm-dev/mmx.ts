import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { findForbiddenGameResourceRefs } from "./check-game-resources.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(scriptsDir, "__fixtures__", "game-resource-guard");

function writeFixture(name, contents) {
  const dir = path.join(fixtures, name);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "sample.ts");
  fs.writeFileSync(file, contents, "utf8");
  return file;
}

describe("game resource guard", () => {
  test("allows isolated test fixtures", () => {
    const fixtureDir = path.join(rootFromScripts(), "packages/engine/tests/fixtures");
    fs.mkdirSync(fixtureDir, { recursive: true });
    const fixture = path.join(fixtureDir, "allowed-sample.json");
    fs.writeFileSync(fixture, '{"animations":{}}', "utf8");
    const hits = findForbiddenGameResourceRefs();
    assert.equal(
      hits.some((hit) => hit.startsWith("packages/engine/tests/fixtures/")),
      false,
    );
  });

  test("rejects root resources imports", () => {
    const file = writeFixture(
      "forbidden-resources",
      `const url = "../../../resources/sprites/player/x.png";\n`,
    );
    const rel = path.relative(rootFromScripts(), file).replaceAll("\\", "/");
    const hits = findForbiddenGameResourceRefs();
    assert.ok(hits.some((hit) => hit.startsWith(rel) && hit.includes("root resources/")));
  });

  test("rejects builtin catalog fallbacks", () => {
    const file = writeFixture(
      "forbidden-builtin",
      `import { createBuiltinRendererAssetManifest } from "./builtinCatalog.js";\n`,
    );
    const rel = path.relative(rootFromScripts(), file).replaceAll("\\", "/");
    const hits = findForbiddenGameResourceRefs();
    assert.ok(hits.some((hit) => hit.startsWith(rel) && hit.includes("builtin renderer")));
  });

  test("detects builtin sound resolver usage in fixtures", () => {
    const file = writeFixture(
      "forbidden-sound",
      `import { createBuiltinSoundResolver } from "./builtinSoundResolver.js";\n`,
    );
    const rel = path.relative(rootFromScripts(), file).replaceAll("\\", "/");
    const hits = findForbiddenGameResourceRefs();
    assert.ok(hits.some((hit) => hit.startsWith(rel) && hit.includes("builtin sound")));
  });

  test("repository source has no forbidden game resource references", () => {
    const hits = findForbiddenGameResourceRefs().filter(
      (hit) => !hit.startsWith("scripts/__fixtures__/game-resource-guard/"),
    );
    assert.deepEqual(hits, []);
  });
});

function rootFromScripts() {
  return path.resolve(scriptsDir, "..");
}
