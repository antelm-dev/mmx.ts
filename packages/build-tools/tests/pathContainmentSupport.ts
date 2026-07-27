import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type LinkCapability = "created" | "unsupported";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
export const syntheticProjectFixture = path.join(fixturesDir, "synthetic-project");

export async function tryCreateSymlink(
  target: string,
  linkPath: string,
  type: "file" | "dir",
): Promise<LinkCapability> {
  try {
    await fs.symlink(target, linkPath, type);
    return "created";
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (
      err.code === "EPERM" ||
      err.code === "EACCES" ||
      err.code === "EINVAL" ||
      /privilege|privilege required|not permitted/i.test(String(err.message))
    ) {
      return "unsupported";
    }
    throw error;
  }
}

export async function createJunction(target: string, linkPath: string): Promise<void> {
  if (process.platform === "win32") {
    await fs.symlink(path.resolve(target), linkPath, "junction");
    return;
  }
  await fs.symlink(path.resolve(target), linkPath, "dir");
}

export async function cloneSyntheticProject(root: string): Promise<void> {
  await fs.cp(syntheticProjectFixture, root, { recursive: true });
}

export async function writeManifest(
  root: string,
  mutate: (manifest: Record<string, unknown>) => void,
): Promise<void> {
  const manifestPath = path.join(root, "project.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Record<string, unknown>;
  mutate(manifest);
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
}

export function messageLeaksFilesystemPath(message: string, ...roots: string[]): boolean {
  if (/[A-Za-z]:[\\/]/.test(message)) return true;
  if (message.includes("\\Users\\") || message.includes("/Users/")) return true;
  if (message.includes("AppData") || message.includes("/tmp/") || message.includes("\\Temp\\")) {
    return true;
  }
  for (const root of roots) {
    if (root.length > 0 && message.includes(root)) return true;
  }
  return false;
}
