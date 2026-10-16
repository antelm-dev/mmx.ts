import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readdir, readFile, realpath, rm, rmdir, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, sep } from "node:path";

/**
 * Untitled ("work") projects live in `<userData>/work-projects/<uuid>` until their first Save
 * moves them to a folder the user picks. Every function takes that folder as `base`, computed by
 * the main process, and only touches paths whose real location is directly under it; the move's
 * destination is the one exception and must be an empty or absent folder outside it.
 */
export const WORK_PROJECTS_DIR = "work-projects";

export type WorkProject = { rootPath: string; name: string; modifiedAt: number };

const inside = (root: string, path: string) => path === root || path.startsWith(`${root}${sep}`);

/** Create an empty `<base>/<uuid>` folder; returns its real path. */
export async function newWorkRoot(base: string): Promise<string> {
  await mkdir(base, { recursive: true });
  const root = join(await realpath(base), randomUUID());
  await mkdir(root);
  return root;
}

/** The real path of `workRoot` when it is a folder directly under `base`; throws otherwise. */
export async function containWorkRoot(base: string, workRoot: string): Promise<string> {
  try {
    const [realBase, real] = await Promise.all([realpath(base), realpath(workRoot)]);
    if (dirname(real) === realBase && (await stat(real)).isDirectory()) return real;
  } catch {
    // Missing or unreadable: refused like any other path.
  }
  throw new Error("Not an unsaved project folder.");
}

/** Work projects under `base` with a readable `project.json`, last modified first. */
export async function listWorkProjects(base: string): Promise<WorkProject[]> {
  let realBase: string;
  try {
    realBase = await realpath(base);
  } catch {
    return [];
  }
  const list: WorkProject[] = [];
  for (const entry of await readdir(realBase, { withFileTypes: true })) {
    // Links (and junctions) are not directories here, so nothing outside `base` is read.
    if (!entry.isDirectory()) continue;
    const rootPath = join(realBase, entry.name);
    const manifest = join(rootPath, "project.json");
    try {
      const info = await lstat(manifest);
      if (!info.isFile()) continue;
      const { name } = JSON.parse(await readFile(manifest, "utf8")) as { name?: unknown };
      list.push({
        rootPath,
        name: typeof name === "string" && name ? name : "Untitled Project",
        modifiedAt: info.mtimeMs,
      });
    } catch {
      // A folder left half-created or with a broken manifest is not offered.
    }
  }
  return list.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

/**
 * The real path `destination` will have, when it is an absolute, empty or absent folder in an
 * existing parent, outside `base`; throws otherwise. `existed` says whether it is already there.
 */
async function emptyDestination(
  base: string,
  destination: string,
): Promise<{ target: string; existed: boolean }> {
  if (!isAbsolute(destination)) throw new Error("Choose a folder to save the project in.");
  let target = join(await realpath(dirname(destination)), basename(destination));
  let existed = true;
  try {
    target = await realpath(target);
  } catch {
    existed = false;
  }
  if (inside(await realpath(base), target)) {
    throw new Error("Choose a folder outside Studio's unsaved projects.");
  }
  if (existed) {
    if (!(await stat(target)).isDirectory()) throw new Error("The destination is not a folder.");
    if ((await readdir(target)).length > 0) throw new Error("Choose an empty folder.");
  }
  return { target, existed };
}

/**
 * Copy the whole work project to `destination`, then delete the work folder. A failed copy
 * removes what it wrote and leaves the work project untouched; a work folder that cannot be
 * deleted after a full copy is reported in `warning` (the project is already at `rootPath`).
 */
export async function moveWorkProject(
  base: string,
  workRoot: string,
  destination: string,
  // Tests make it fail part-way.
  copy = cp,
): Promise<{ rootPath: string; warning?: string }> {
  const source = await containWorkRoot(base, workRoot);
  const { target, existed } = await emptyDestination(base, destination);
  // cp refuses an existing folder; rmdir only removes an empty one, so nothing is overwritten.
  if (existed) await rmdir(target);
  try {
    await copy(source, target, { recursive: true, errorOnExist: true, force: false });
  } catch (error) {
    // Only this copy's files: the destination was empty or absent.
    await rm(target, { recursive: true, force: true }).catch(() => undefined);
    if (existed) await mkdir(target).catch(() => undefined);
    throw error;
  }
  try {
    await rm(source, { recursive: true, force: true });
    return { rootPath: target };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { rootPath: target, warning: `The unsaved copy could not be removed: ${reason}` };
  }
}

/** Delete a work project folder (after `containWorkRoot`). */
export async function deleteWorkProject(base: string, workRoot: string): Promise<void> {
  await rm(await containWorkRoot(base, workRoot), { recursive: true, force: true });
}
