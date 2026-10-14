import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";

import { parseProject, validateProject } from "@mmx/project-schema";

import { resolveStarterTemplateRoot } from "../../src/starter-template/paths.js";

test("starter manifest parses with project-schema", async () => {
  const root = resolveStarterTemplateRoot();
  const raw = JSON.parse(await readFile(join(root, "project.json"), "utf8"));
  const parsed = parseProject(raw);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.issues));
  assert.ok(parsed.project);
  assert.equal(parsed.project.entryLevelId, "level.starter");
});

test("starter manifest validates structurally", async () => {
  const root = resolveStarterTemplateRoot();
  const raw = JSON.parse(await readFile(join(root, "project.json"), "utf8"));
  const parsed = parseProject(raw);
  if (!parsed.ok || !parsed.project) throw new Error("manifest parse failed");
  const validation = validateProject(parsed.project);
  assert.equal(validation.ok, true, JSON.stringify(validation.issues));
});

test("starter game data bindings reference manifest ids", async () => {
  const root = resolveStarterTemplateRoot();
  const manifest = JSON.parse(await readFile(join(root, "project.json"), "utf8"));
  const gameData = JSON.parse(await readFile(join(root, "game/data.json"), "utf8"));
  const ids = new Set(manifest.assets.map((asset: { id: string }) => asset.id));
  const bindings = gameData.bindings;

  for (const value of Object.values(bindings.sounds as Record<string, string>)) {
    assert.ok(ids.has(value), `missing sound binding ${value}`);
  }
});
