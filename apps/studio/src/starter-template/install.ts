import {
  MMX_PLAYER_X,
  MMX_PLAYER_ZERO,
  MMX_STARTER,
  mergePack,
  type PackContent,
} from "@mmx/content-schema";
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

/** What File → Install / update MMX packs… installs, in this order. */
const INSTALLED_PACKS: readonly PackContent[] = [MMX_STARTER, MMX_PLAYER_X, MMX_PLAYER_ZERO];

/**
 * Contract C-INSTALL: give the project at `rootPath` what the MMX Starter, X and Zero packs have
 * and it lacks ({@link mergePack}: records, record keys, manifest entries, bindings) and the
 * packs' files its new entries name, read from `packRoot(packId)`. Nothing is replaced: a file at
 * a pack path that differs from the pack's is kept, and its entries are not added. With `dryRun`,
 * nothing is written. Files are copied first, then `data/game.json` and `game/data.json`, then
 * `project.json`, as `saveProject` writes records before the manifest: a run cut short is
 * completed by the next one.
 */
export async function installPack(
  rootPath: string,
  packRoot: (packId: string) => string,
  dryRun = false,
): Promise<ProjectResult<PackInstall>> {
  const { createNodeFileSystem } = await import("../project-io/node.js");
  const fs = createNodeFileSystem(rootPath);
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

  let next = { manifest, overlay, bindingsFile };
  const added: string[] = [];
  const skipped: string[] = [];
  const copies = new Map<string, Uint8Array>();
  for (const pack of INSTALLED_PACKS) {
    const packFs = createNodeFileSystem(packRoot(pack.ref.id));
    const missing: string[] = [];
    const occupied = new Set<string>();
    const files = new Map<string, Uint8Array>();
    for (const path of new Set(pack.assets.map((asset) => asset.path))) {
      const bytes = await packFs.readBytes(path);
      files.set(path, bytes);
      if (!(await fs.exists(path))) missing.push(path);
      else if (!sameBytes(await fs.readBytes(path), bytes)) occupied.add(path);
    }

    const merged = mergePack({ ...next, occupiedPaths: occupied }, pack);
    next = merged;
    // Every file the project's own entries name exists (loadProject checked): a missing one is the pack's.
    const copied = missing.filter((path) => merged.manifest.assets.some((a) => a.path === path));
    for (const path of copied) copies.set(path, files.get(path)!);
    added.push(...merged.added, ...copied.map((path) => `file ${path}`));
    // Each pack says why it binds nothing (no game/data.json…): listed once.
    for (const line of [
      ...merged.skipped,
      ...[...occupied].map((path) => `file ${path}: kept the project's`),
    ])
      if (!skipped.includes(line)) skipped.push(line);
  }
  if (dryRun) return succeed({ added, skipped });

  for (const [path, bytes] of copies) await fs.writeBytes(path, bytes);
  if (next.overlay !== overlay) await fs.writeText(CANONICAL_GAME_DATA_FILE, json(next.overlay));
  if (next.bindingsFile !== bindingsFile)
    await fs.writeText(GAME_DATA_FILE, json(next.bindingsFile));
  if (next.manifest !== manifest)
    await fs.writeText(PROJECT_MANIFEST, serializeProject(next.manifest));
  return succeed({ added, skipped });
}
