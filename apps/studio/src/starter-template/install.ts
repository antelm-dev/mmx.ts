import { MMX_STARTER, mergePack } from "@mmx/content-schema";
import type { GameDataOverlay } from "@mmx/engine/data";
import { serializeProject, type ProjectDocument } from "@mmx/project-schema";
import {
  fail,
  issue,
  loadProject,
  succeed,
  type FileSystem,
  type ProjectResult,
} from "../project-io/index.js";
import { CANONICAL_GAME_DATA_FILE, GAME_DATA_FILE, PROJECT_MANIFEST } from "../project-io/paths.js";

/** What {@link installPack} added to a project, and what it kept as the project has it. */
export type PackInstall = { added: string[]; skipped: string[] };

const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

async function readJson(fs: FileSystem, path: string): Promise<unknown> {
  return (await fs.exists(path)) ? JSON.parse(await fs.readText(path)) : undefined;
}

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && a.every((byte, index) => byte === b[index]);

/**
 * Contract C-INSTALL: give the project at `rootPath` what the MMX Starter pack has and it lacks
 * ({@link mergePack}: records, record keys, manifest entries, bindings) and the pack's files its
 * new entries name, read from `packRoot`. Nothing is replaced: a file at a pack path that differs
 * from the pack's is kept, and its entries are not added. With `dryRun`, nothing is written.
 * Files are copied first, then `data/game.json` and `game/data.json`, then `project.json`, as
 * `saveProject` writes records before the manifest: a run cut short is completed by the next one.
 */
export async function installPack(
  rootPath: string,
  packRoot: string,
  dryRun = false,
): Promise<ProjectResult<PackInstall>> {
  const { createNodeFileSystem } = await import("../project-io/node.js");
  const fs = createNodeFileSystem(rootPath);
  const packFs = createNodeFileSystem(packRoot);
  // Only into a project Studio can open: a broken one is left for the user to fix.
  const loaded = await loadProject(fs);
  if (!loaded.ok) return fail(loaded.issues);

  let manifest: ProjectDocument;
  let overlay: GameDataOverlay | undefined;
  let bindingsFile: unknown;
  try {
    // As written, not as loaded: a project from before packs is migrated in memory only.
    manifest = JSON.parse(await fs.readText(PROJECT_MANIFEST));
    overlay = (await readJson(fs, CANONICAL_GAME_DATA_FILE)) as GameDataOverlay | undefined;
    bindingsFile = await readJson(fs, GAME_DATA_FILE);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail([issue("pack.read", message, `/${GAME_DATA_FILE}`)]);
  }

  const missing: string[] = [];
  const occupied = new Set<string>();
  const files = new Map<string, Uint8Array>();
  for (const path of new Set(MMX_STARTER.assets.map((asset) => asset.path))) {
    const bytes = await packFs.readBytes(path);
    files.set(path, bytes);
    if (!(await fs.exists(path))) missing.push(path);
    else if (!sameBytes(await fs.readBytes(path), bytes)) occupied.add(path);
  }

  const merged = mergePack({ manifest, overlay, bindingsFile, occupiedPaths: occupied });
  // Every file the project's own entries name exists (loadProject checked): a missing one is the pack's.
  const copies = missing.filter((path) => merged.manifest.assets.some((a) => a.path === path));
  const added = [...merged.added, ...copies.map((path) => `file ${path}`)];
  const skipped = [
    ...merged.skipped,
    ...[...occupied].map((path) => `file ${path}: kept the project's`),
  ];
  if (dryRun) return succeed({ added, skipped });

  for (const path of copies) await fs.writeBytes(path, files.get(path)!);
  if (merged.overlay !== overlay)
    await fs.writeText(CANONICAL_GAME_DATA_FILE, json(merged.overlay));
  if (merged.bindingsFile !== bindingsFile)
    await fs.writeText(GAME_DATA_FILE, json(merged.bindingsFile));
  if (merged.manifest !== manifest)
    await fs.writeText(PROJECT_MANIFEST, serializeProject(merged.manifest));
  return succeed({ added, skipped });
}
