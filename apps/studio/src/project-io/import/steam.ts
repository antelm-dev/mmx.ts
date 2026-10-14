// Locate the user's Steam installs of the two Legacy Collections (port of zero-x-mashup engine/src/steam.rs).
// Only stats the default Steam roots, their libraryfolders.vdf and the game folders; never writes.
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export const STEAM_GAMES = {
  /** Mega Man X Legacy Collection: the MMX1 ROM lives inside RXC1.exe. */
  mmxlc: { env: "MMXLC_DIR", folder: "Mega Man X Legacy Collection", marker: "RXC1.exe" },
  /** Mega Man Zero/ZX Legacy Collection: ARC archives under nativePCx64. */
  mzzxlc: { env: "MZZXLC_DIR", folder: "MZZXLC", marker: "nativePCx64" },
} as const;

export type SteamGame = keyof typeof STEAM_GAMES;

export type SteamGameResult = { ok: true; root: string } | { ok: false; error: string };

// ponytail: default Windows Steam roots only; read HKCU\Software\Valve\Steam\SteamPath if someone installs Steam elsewhere
export const DEFAULT_STEAM_ROOTS = ["C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam"];

/** Library folders listed in a `libraryfolders.vdf` (`"path"  "D:\\SteamLibrary"` lines). */
export function parseLibraryFolders(vdf: string): string[] {
  const paths: string[] = [];
  for (const line of vdf.split(/\r?\n/)) {
    const m = /^\s*"path"\s+"((?:[^"\\]|\\.)*)"/.exec(line);
    if (m) paths.push(m[1].replace(/\\(.)/g, "$1"));
  }
  return paths;
}

const exists = (path: string) => stat(path).then(() => true, () => false);

/** `steamapps/common` folders of every library found under the Steam roots (the roots themselves if no vdf). */
export async function steamLibraries(steamRoots: readonly string[] = DEFAULT_STEAM_ROOTS): Promise<string[]> {
  const libs: string[] = [];
  for (const root of steamRoots) {
    const vdf = await readFile(join(root, "steamapps", "libraryfolders.vdf"), "utf8").catch(() => null);
    if (vdf !== null) libs.push(...parseLibraryFolders(vdf));
  }
  return (libs.length > 0 ? libs : [...steamRoots]).map((lib) => join(lib, "steamapps", "common"));
}

/** The game's install folder: the env override if set, else the first Steam library that has it. */
export async function findSteamGame(
  game: SteamGame,
  { env = process.env, steamRoots = DEFAULT_STEAM_ROOTS }: { env?: NodeJS.ProcessEnv; steamRoots?: readonly string[] } = {},
): Promise<SteamGameResult> {
  const { env: envName, folder, marker } = STEAM_GAMES[game];
  const override = env[envName];
  if (override) {
    return (await exists(join(override, marker)))
      ? { ok: true, root: override }
      : { ok: false, error: `${envName}=${override} has no ${marker}. Point it at the "${folder}" install folder.` };
  }
  for (const common of await steamLibraries(steamRoots)) {
    const root = join(common, folder);
    if (await exists(join(root, marker))) return { ok: true, root };
  }
  return { ok: false, error: `${folder} is not installed in your Steam libraries. Install it from Steam, or set ${envName} to its folder.` };
}
