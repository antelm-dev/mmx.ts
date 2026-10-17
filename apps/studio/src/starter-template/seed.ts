import { serializeProject, type ProjectDocument } from "@mmx/project-schema";
import {
  collectGameBindingAssetIds,
  collectReferencedAssetIds,
  fail,
  GAME_DATA_FILE,
  issue,
  loadProject,
  PROJECT_MANIFEST,
  type ProjectResult,
  type StudioProject,
} from "../project-io/index.js";

import { STARTER_GAME_DATA, STARTER_MANIFEST, resolveStarterTemplateRoot } from "./paths.js";

/**
 * Give the project at `rootPath`, which has no `game/data.json`, the starter's, bound to
 * `playerAnimation`. The starter assets those bindings name (and their sheets) are copied in and
 * added to its manifest, so the project still builds and exports on its own. Returns it reloaded.
 */
export async function seedStarterGameData(
  rootPath: string,
  playerAnimation: string,
  templateRoot = resolveStarterTemplateRoot(),
): Promise<ProjectResult<StudioProject>> {
  const { createNodeFileSystem } = await import("../project-io/node.js");
  const fs = createNodeFileSystem(rootPath);
  const templateFs = createNodeFileSystem(templateRoot);
  const starter = JSON.parse(await templateFs.readText(STARTER_MANIFEST)) as ProjectDocument;
  const starterData = JSON.parse(await templateFs.readText(STARTER_GAME_DATA));
  const data = { ...starterData, bindings: { ...starterData.bindings, playerAnimation } };
  const manifest = JSON.parse(await fs.readText(PROJECT_MANIFEST)) as ProjectDocument;

  const own = new Set(manifest.assets.map((asset) => asset.id));
  const bound = collectGameBindingAssetIds(data);
  const needed = collectReferencedAssetIds(starter, [], bound);
  const added = starter.assets.filter((asset) => needed.has(asset.id) && !own.has(asset.id));
  for (const asset of added) {
    // Never over a file of the project's own: its asset would change under it.
    if (await fs.exists(asset.path)) {
      return fail([
        issue(
          "game-data.seed",
          `Cannot add the starter asset '${asset.id}': '${asset.path}' already exists in the project.`,
          `/${GAME_DATA_FILE}`,
        ),
      ]);
    }
  }
  for (const asset of added)
    await fs.writeBytes(asset.path, await templateFs.readBytes(asset.path));
  await fs.writeText(
    PROJECT_MANIFEST,
    serializeProject({ ...manifest, assets: [...manifest.assets, ...added] }),
  );
  await fs.writeText(GAME_DATA_FILE, `${JSON.stringify(data, null, 2)}\n`);
  return loadProject(fs);
}
