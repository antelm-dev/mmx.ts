import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { validateDocument } from "@mmx/content-schema";
import { parseProject } from "@mmx/project-schema";

const demoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../templates/mmx-demo");

test("demo project contains both converted levels and a valid manifest", async () => {
  const manifest = JSON.parse(await readFile(join(demoRoot, "project.json"), "utf8"));
  const parsed = parseProject(manifest);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues));
  assert.ok(parsed.project);
  assert.equal(parsed.project.entryLevelId, "level.mechanics-demo");
  assert.deepEqual(
    parsed.project.levels.map((level) => level.id),
    ["level.stage-1", "level.mechanics-demo"],
  );

  for (const level of parsed.project.levels) {
    const document = JSON.parse(await readFile(join(demoRoot, level.path), "utf8"));
    const validation = validateDocument(document);
    assert.equal(validation.ok, true, `${level.id}: ${JSON.stringify(validation.issues)}`);
  }
});
