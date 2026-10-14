import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { defineIpcEvents, defineIpcModule, handle } from "electron-ipc-module";
import { fail, issue, loadProject, type ProjectPayload, type ProjectResult } from "@mmx/project-io";
import {
  createNodeFileSystem,
  readZeroSources,
  readZeroSourcesFromCache,
  writeZeroProject,
  ZERO_PROJECT_ID,
} from "@mmx/project-io/node";
import { resolveStarterTemplateRoot } from "@mmx/starter-template";

type ImportEvents = {
  "import-progress": [step: string];
};

export const importEvents = defineIpcEvents<ImportEvents>();

/** Empty, or a previous Zero import: never write over someone else's files. */
async function isWritableTarget(rootPath: string): Promise<boolean> {
  const entries = await readdir(rootPath);
  if (entries.length === 0) return true;
  try {
    return JSON.parse(await readFile(join(rootPath, "project.json"), "utf8")).id === ZERO_PROJECT_ID;
  } catch {
    return false;
  }
}

/**
 * The `import` IPC module: File → Import from Steam installs. Reads MMX1 and MMZ1 from the user's own
 * Legacy Collections (docs/zero-import.md), writes a Studio project into the picked folder and loads it.
 * Progress steps go to the calling window as `import-progress`.
 */
export function createImportIpc() {
  return defineIpcModule("import", {
    "from-steam": handle(async (event, rootPath: string): Promise<ProjectResult<ProjectPayload>> => {
      const progress = (step: string) => event.sender.send("import-progress", step);
      try {
        if (!(await isWritableTarget(rootPath))) {
          return fail([issue("zero-import.folder", "Choose an empty folder (or a previous Zero import) for the imported project.", "/")]);
        }
        // e2e only: a zero-x-mashup cache folder stands in for the Steam installs.
        const cache = process.env.MMX_STUDIO_ZERO_IMPORT_CACHE;
        const sources = cache ? await readZeroSourcesFromCache(cache) : await readZeroSources(progress);
        const template = createNodeFileSystem(join(dirname(resolveStarterTemplateRoot()), "mmx-demo"));
        await writeZeroProject(createNodeFileSystem(rootPath), template, sources, progress);
        progress("Opening the project");
        const loaded = await loadProject(createNodeFileSystem(rootPath));
        if (!loaded.ok) return fail(loaded.issues);
        return { ok: true, value: { rootPath, project: loaded.value }, issues: loaded.issues };
      } catch (error) {
        return fail([issue("zero-import.failed", error instanceof Error ? error.message : String(error), "/")]);
      }
    }),
  });
}
