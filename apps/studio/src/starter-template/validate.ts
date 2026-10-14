import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { parseProject, validateProject, type ProjectDocument } from "@mmx/project-schema";
import type { FileSystem } from "../project-io/index.js";

import { STARTER_ATTRIBUTION, STARTER_GAME_DATA, STARTER_MANIFEST, resolveStarterTemplateRoot } from "./paths.js";

export type StarterValidationCounts = {
  sprites: number;
  animations: number;
  sounds: number;
  fonts: number;
  images: number;
  total: number;
};

export type StarterValidationResult = {
  manifest: ProjectDocument;
  counts: StarterValidationCounts;
  issues: ReturnType<typeof validateProject>["issues"];
};

function countAssets(manifest: ProjectDocument): StarterValidationCounts {
  const counts = { sprites: 0, animations: 0, sounds: 0, fonts: 0, images: 0, total: manifest.assets.length };
  for (const asset of manifest.assets) {
    switch (asset.kind) {
      case "sprite":
        counts.sprites += 1;
        break;
      case "animation":
        counts.animations += 1;
        break;
      case "sound":
        counts.sounds += 1;
        break;
      case "font":
        counts.fonts += 1;
        break;
      case "image":
        counts.images += 1;
        break;
    }
  }
  return counts;
}

export async function validateStarterTemplate(fs: FileSystem): Promise<StarterValidationResult> {
  const raw = JSON.parse(await fs.readText(STARTER_MANIFEST));
  const parsed = parseProject(raw);
  if (!parsed.ok || !parsed.project) {
    throw new Error(
      parsed.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n") || "Invalid starter manifest",
    );
  }

  const schema = validateProject(parsed.project);
  const issues = [...schema.issues];

  for (const [index, asset] of parsed.project.assets.entries()) {
    if (!(await fs.exists(asset.path))) {
      issues.push({
        severity: "error",
        code: "asset.missing",
        message: `Starter asset file '${asset.path}' for id '${asset.id}' does not exist.`,
        path: `/assets/${index}/path`,
      });
    }
  }

  if (!(await fs.exists(STARTER_GAME_DATA))) {
    issues.push({
      severity: "error",
      code: "starter.gameData.missing",
      message: `Starter game data not found at ${STARTER_GAME_DATA}.`,
      path: "/game/data.json",
    });
  }

  if (!(await fs.exists(STARTER_ATTRIBUTION))) {
    issues.push({
      severity: "warning",
      code: "starter.attribution.missing",
      message: `Attribution file not found at ${STARTER_ATTRIBUTION}.`,
      path: "/ATTRIBUTION.md",
    });
  }

  for (const level of parsed.project.levels) {
    if (!(await fs.exists(level.path))) {
      issues.push({
        severity: "error",
        code: "level.missing",
        message: `Starter level '${level.path}' is missing.`,
        path: `/levels/${level.id}`,
      });
    }
  }

  if (issues.some((issue) => issue.severity === "error")) {
    throw new Error(issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
  }

  return {
    manifest: parsed.project,
    counts: countAssets(parsed.project),
    issues,
  };
}

export async function validateStarterTemplateOnDisk(
  root = resolveStarterTemplateRoot(),
): Promise<StarterValidationResult> {
  const { createNodeFileSystem } = await import("../project-io/node.js");
  return validateStarterTemplate(createNodeFileSystem(root));
}

export async function readStarterManifest(root = resolveStarterTemplateRoot()): Promise<ProjectDocument> {
  const raw = JSON.parse(await readFile(join(root, STARTER_MANIFEST), "utf8"));
  const parsed = parseProject(raw);
  if (!parsed.ok || !parsed.project) {
    throw new Error("Starter manifest failed validation.");
  }
  return parsed.project;
}
