import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { readLevelDocument } from "../src/compileLevel.js";
import { ProjectLoadError } from "../src/errors.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const syntheticProject = path.join(fixturesDir, "synthetic-project");

test("readLevelDocument loads a portable path under the project root", async () => {
  const document = await readLevelDocument(syntheticProject, "levels/level.main.json", (absolute) =>
    fs.readFile(absolute, "utf8"),
  );
  assert.equal(document.id, "level.main");
});

test("readLevelDocument rejects traversal outside the project root", async () => {
  let readCalled = false;
  await assert.rejects(
    () =>
      readLevelDocument(syntheticProject, "../package.json", async () => {
        readCalled = true;
        return "{}";
      }),
    (error: unknown) => error instanceof ProjectLoadError && error.code === "path.traversal",
  );
  assert.equal(readCalled, false);
});

test("readLevelDocument rejects Windows separators and absolute paths", async () => {
  await assert.rejects(
    () =>
      readLevelDocument(syntheticProject, "levels\\level.main.json", async () => {
        return "{}";
      }),
    (error: unknown) => error instanceof ProjectLoadError && error.code === "path.traversal",
  );
  await assert.rejects(
    () =>
      readLevelDocument(syntheticProject, "/tmp/level.json", async () => {
        return "{}";
      }),
    (error: unknown) => error instanceof ProjectLoadError && error.code === "path.traversal",
  );
});

test("readLevelDocument does not read sibling-prefix paths outside the root", async () => {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), "mmx-level-root-"));
  const root = path.join(parent, "game");
  const sibling = path.join(parent, "game-evil");
  try {
    await fs.mkdir(root, { recursive: true });
    await fs.mkdir(sibling, { recursive: true });
    await fs.writeFile(path.join(sibling, "leak.json"), '{"id":"leak"}', "utf8");
    let readCalled = false;
    await assert.rejects(
      () =>
        readLevelDocument(root, "../game-evil/leak.json", async () => {
          readCalled = true;
          return "{}";
        }),
      (error: unknown) => error instanceof ProjectLoadError && error.code === "path.traversal",
    );
    assert.equal(readCalled, false);
  } finally {
    await fs.rm(parent, { recursive: true, force: true });
  }
});
