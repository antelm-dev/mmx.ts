#!/usr/bin/env node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  copyStarterProjectToDirectory,
} from "../dist/starter-template/index.js";
import {
  exportProject,
  saveProject,
  updateLevelDocument,
} from "../dist/project-io/index.js";
import { createNodeFileSystem } from "../dist/project-io/node.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const studioRoot = resolve(scriptDir, "..");

const { values } = parseArgs({
  options: {
    scenario: { type: "string", default: "clean" },
    out: { type: "string" },
    workspace: { type: "string" },
  },
});

async function prepareCleanProject(exportDir) {
  const workspace =
    values.workspace ??
    (await mkdtemp(join(tmpdir(), "mmx-e2e-project-")));

  const created = await copyStarterProjectToDirectory(workspace, {
    id: "e2e.demo",
    name: "E2E Demo",
  });
  if (!created.ok) {
    throw new Error(created.issues.map((issue) => issue.message).join("\n"));
  }

  const fs = createNodeFileSystem(workspace);
  let project = created.value;
  const entryLevel = project.levels.find((level) => level.id === project.manifest.entryLevelId);
  if (!entryLevel) {
    throw new Error(`Entry level '${project.manifest.entryLevelId}' is missing.`);
  }

  const level = structuredClone(entryLevel.document);
  level.decorations.push({
    id: "deco.e2e",
    assetId: "sprite.hud.x-bar",
    x: 128,
    y: 64,
    layer: "background",
    parallax: 1,
    flipX: false,
    flipY: false,
  });
  level.objects.push({
    id: "spawn.e2e",
    definitionId: "spawn",
    x: 96,
    y: 256,
  });

  project = updateLevelDocument(project, entryLevel.id, level);
  const saved = await saveProject(fs, project);
  if (!saved.ok) {
    throw new Error(saved.issues.map((issue) => issue.message).join("\n"));
  }

  await mkdir(exportDir, { recursive: true });
  const destFs = createNodeFileSystem(exportDir);
  const exported = await exportProject(fs, destFs, saved.value);
  if (!exported.ok) {
    throw new Error(exported.issues.map((issue) => issue.message).join("\n"));
  }

  return {
    workspace,
    exportDir,
    exported,
    project: saved.value,
  };
}

async function main() {
  const scenario = values.scenario ?? "clean";
  const exportDir =
    values.out != null
      ? resolve(values.out)
      : await mkdtemp(join(tmpdir(), "mmx-e2e-export-"));

  if (scenario !== "clean") {
    throw new Error(`Unsupported scenario '${scenario}'.`);
  }

  const result = await prepareCleanProject(exportDir);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      scenario,
      studioRoot,
      workspace: result.workspace,
      exportDir: result.exportDir,
      exportedAssets: result.exported.value.exportedAssets.length,
      exportedDataFiles: result.exported.value.exportedDataFiles,
      entryLevelId: result.project.manifest.entryLevelId,
    })}\n`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
