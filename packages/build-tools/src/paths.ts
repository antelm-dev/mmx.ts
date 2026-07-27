import fs from "node:fs/promises";
import path from "node:path";
import { isPortableRelativePath } from "@mmx/project-schema";
import { ProjectBuildError, ProjectLoadError } from "./errors.js";

export function assertWithinRoot(root: string, resolved: string): void {
  const rootResolved = path.resolve(root);
  const targetResolved = path.resolve(resolved);
  const relative = path.relative(rootResolved, targetResolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new ProjectLoadError(
      "path.traversal",
      relative,
      `Resolved path escapes the containment root.`,
    );
  }
}

export function assertWithinProjectRoot(root: string, resolved: string): void {
  const rootResolved = path.resolve(root);
  const targetResolved = path.resolve(resolved);
  const relative = path.relative(rootResolved, targetResolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new ProjectLoadError(
      "path.traversal",
      relative,
      `Resolved path escapes the project root: '${relative}'.`,
    );
  }
}

export function resolveProjectPath(root: string, relativePath: string): string {
  if (!isPortableRelativePath(relativePath)) {
    throw new ProjectLoadError(
      "path.traversal",
      relativePath,
      `Project path '${relativePath}' is not a portable relative path.`,
    );
  }
  const normalized = relativePath.split("/").join(path.sep);
  const resolved = path.resolve(root, normalized);
  assertWithinProjectRoot(root, resolved);
  return resolved;
}

export function toPortablePath(root: string, absolutePath: string): string {
  const relative = path.relative(path.resolve(root), path.resolve(absolutePath));
  assertWithinProjectRoot(root, absolutePath);
  return relative.split(path.sep).join("/");
}

export type ContainedPath = {
  absolutePath: string;
  exists: boolean;
};

function linkEscapeError(logicalPath: string): ProjectLoadError {
  return new ProjectLoadError(
    "path.traversal",
    logicalPath,
    `Project path '${logicalPath}' escapes the project root through a filesystem link.`,
  );
}

function assertRealpathWithinRoot(
  rootReal: string,
  candidateReal: string,
  logicalPath: string,
): void {
  try {
    assertWithinRoot(rootReal, candidateReal);
  } catch (error) {
    if (error instanceof ProjectLoadError) {
      throw linkEscapeError(logicalPath);
    }
    throw error;
  }
}

async function containMissingPath(
  rootReal: string,
  absolute: string,
  logicalPath: string,
): Promise<ContainedPath> {
  let probe = absolute;
  for (;;) {
    const parent = path.dirname(probe);
    if (parent === probe) {
      throw linkEscapeError(logicalPath);
    }
    try {
      const parentReal = await fs.realpath(parent);
      assertRealpathWithinRoot(rootReal, parentReal, logicalPath);
      const suffix = path.relative(parent, absolute);
      if (suffix === ".." || suffix.startsWith(`..${path.sep}`) || path.isAbsolute(suffix)) {
        throw linkEscapeError(logicalPath);
      }
      const reconstructed = suffix.length === 0 ? parentReal : path.resolve(parentReal, suffix);
      assertRealpathWithinRoot(rootReal, reconstructed, logicalPath);
      return { absolutePath: reconstructed, exists: false };
    } catch (error) {
      if (error instanceof ProjectLoadError) {
        throw error;
      }
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        probe = parent;
        continue;
      }
      throw linkEscapeError(logicalPath);
    }
  }
}

export async function containAbsolutePath(
  root: string,
  absolutePath: string,
  logicalPath = path.basename(absolutePath),
): Promise<ContainedPath> {
  const rootReal = await fs.realpath(path.resolve(root));
  const absolute = path.resolve(absolutePath);

  try {
    const real = await fs.realpath(absolute);
    assertRealpathWithinRoot(rootReal, real, logicalPath);
    return { absolutePath: real, exists: true };
  } catch (error) {
    if (error instanceof ProjectLoadError) {
      throw error;
    }
    const err = error as NodeJS.ErrnoException;
    if (err.code === "ENOENT") {
      return containMissingPath(rootReal, absolute, logicalPath);
    }
    throw linkEscapeError(logicalPath);
  }
}

export async function resolveContainedProjectPath(
  root: string,
  relativePath: string,
): Promise<ContainedPath> {
  const absolute = resolveProjectPath(root, relativePath);
  return containAbsolutePath(root, absolute, relativePath);
}

export async function containEmittedAssetPath(
  assetsRoot: string,
  absolutePath: string,
): Promise<ContainedPath> {
  try {
    return await containAbsolutePath(assetsRoot, absolutePath, path.basename(absolutePath));
  } catch (error) {
    if (error instanceof ProjectLoadError && error.code === "path.traversal") {
      throw new ProjectBuildError("asset.path", "Asset URL is malformed.");
    }
    throw error;
  }
}

export type ResolvedEmittedAssetPath = {
  absolutePath: string;
  fileName: string;
};

function isRejectedAssetFileName(value: string): boolean {
  if (value.length === 0) return true;
  if (value.includes("\0")) return true;
  if (value.includes("/") || value.includes("\\")) return true;
  if (value === "." || value === "..") return true;
  if (path.isAbsolute(value)) return true;
  if (/^[a-zA-Z]:/.test(value)) return true;
  if (/^[a-zA-Z][a-zA-Z+\-.]*:/.test(value)) return true;
  if (value.includes(path.sep)) return true;
  return false;
}

export function resolveEmittedAssetPath(
  assetsRoot: string,
  urlSuffix: string,
): ResolvedEmittedAssetPath {
  if (typeof urlSuffix !== "string" || isRejectedAssetFileName(urlSuffix)) {
    throw new ProjectBuildError("asset.path", "Asset URL is malformed.");
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(urlSuffix);
  } catch {
    throw new ProjectBuildError("asset.path", "Asset URL encoding is malformed.");
  }

  if (isRejectedAssetFileName(decoded)) {
    throw new ProjectBuildError("asset.path", "Asset URL is malformed.");
  }

  const rootResolved = path.resolve(assetsRoot);
  const absolutePath = path.resolve(rootResolved, decoded);

  try {
    assertWithinRoot(rootResolved, absolutePath);
  } catch {
    throw new ProjectBuildError("asset.path", "Asset URL is malformed.");
  }

  if (path.basename(absolutePath) !== decoded) {
    throw new ProjectBuildError("asset.path", "Asset URL is malformed.");
  }

  return { absolutePath, fileName: decoded };
}
