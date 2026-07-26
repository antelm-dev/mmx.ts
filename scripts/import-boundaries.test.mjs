import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";

import { FORBIDDEN_SPECIFIERS, findForbiddenImports } from "./check-forbidden-imports.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.join(root, "fixtures", "import-boundaries");

function oxlint(files) {
  return spawnSync("pnpm", ["exec", "oxlint", "--deny-warnings", ...files], {
    cwd: root,
    encoding: "utf8",
    shell: true,
  });
}

function listFiles(dir) {
  return fs
    .readdirSync(dir)
    .map((name) => path.join(dir, name))
    .filter((file) => fs.statSync(file).isFile());
}

describe("import boundary guard", () => {
  test("allows public entry points", () => {
    const files = listFiles(path.join(fixtures, "allowed"));
    const result = oxlint(files);
    assert.equal(
      result.status,
      0,
      `expected allowed fixtures to pass oxlint:\n${result.stdout}\n${result.stderr}`,
    );
  });

  test("rejects deep engine/game imports", () => {
    const file = path.join(fixtures, "forbidden", "engine-game.ts");
    const result = oxlint([file]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /@mmx\/engine/);
  });

  test("rejects deep engine/core imports", () => {
    const file = path.join(fixtures, "forbidden", "engine-core.ts");
    const result = oxlint([file]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /@mmx\/engine/);
  });

  test("rejects deep renderer-pixi/render imports", () => {
    const file = path.join(fixtures, "forbidden", "renderer-render.ts");
    const result = oxlint([file]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /@mmx\/renderer-pixi/);
  });

  test("rejects import type and dynamic import via oxlint", () => {
    for (const name of ["engine-game-type.ts", "engine-game-dynamic.ts"]) {
      const file = path.join(fixtures, "forbidden", name);
      const result = oxlint([file]);
      assert.notEqual(
        result.status,
        0,
        `expected oxlint to reject ${name}:\n${result.stdout}\n${result.stderr}`,
      );
    }
  });

  test("rejects require() via repository specifier scan", () => {
    const file = path.join(fixtures, "forbidden", "engine-core-require.cjs");
    const source = fs.readFileSync(file, "utf8");
    assert.match(source, FORBIDDEN_SPECIFIERS);
    assert.match(source, /require\(\s*["']@mmx\/engine\/core\//);
  });

  test("repository source has no forbidden deep import specifiers", () => {
    assert.deepEqual(findForbiddenImports(), []);
  });
});
