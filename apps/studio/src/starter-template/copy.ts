import { cp, mkdir } from "node:fs/promises";

import { serializeProject, type ProjectDocument } from "@mmx/project-schema";
import { loadProject, type ProjectResult, type StudioProject } from "../project-io/index.js";
import { issue, fail } from "../project-io/index.js";

import { STARTER_MANIFEST, resolveStarterTemplateRoot } from "./paths.js";
import { validateStarterTemplate } from "./validate.js";

export type CreateFromStarterInput = {
  id: string;
  name: string;
  gameVersion?: string;
};

function patchManifest(manifest: ProjectDocument, input: CreateFromStarterInput): ProjectDocument {
  return {
    ...manifest,
    id: input.id,
    name: input.name,
    gameVersion: input.gameVersion ?? manifest.gameVersion,
  };
}

export async function copyStarterProjectToDirectory(
  destinationRoot: string,
  input: CreateFromStarterInput,
  templateRoot = resolveStarterTemplateRoot(),
): Promise<ProjectResult<StudioProject>> {
  const { createNodeFileSystem } = await import("../project-io/node.js");
  const templateFs = createNodeFileSystem(templateRoot);
  const destFs = createNodeFileSystem(destinationRoot);

  if (await destFs.exists(STARTER_MANIFEST)) {
    return fail([
      issue(
        "project.exists",
        `Refusing to overwrite existing project manifest at ${STARTER_MANIFEST}.`,
        STARTER_MANIFEST,
      ),
    ]);
  }

  try {
    await validateStarterTemplate(templateFs);
  } catch (error) {
    return fail([
      issue(
        "starter.invalid",
        error instanceof Error ? error.message : String(error),
        STARTER_MANIFEST,
      ),
    ]);
  }

  await mkdir(destinationRoot, { recursive: true });
  await cp(templateRoot, destinationRoot, { recursive: true });

  const raw = JSON.parse(await destFs.readText(STARTER_MANIFEST));
  const manifest = patchManifest(raw, input);
  await destFs.writeText(STARTER_MANIFEST, serializeProject(manifest));

  return loadProject(destFs);
}

export async function exportFreshStarterCopy(exportRoot: string): Promise<ProjectResult<StudioProject>> {
  return copyStarterProjectToDirectory(exportRoot, {
    id: "mmx.starter.export",
    name: "MMX Starter Export",
  });
}
