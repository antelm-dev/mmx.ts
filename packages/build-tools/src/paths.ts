import path from "node:path";
import { isPortableRelativePath } from "@mmx/project-schema";
import { ProjectLoadError } from "./errors.js";

export function assertWithinProjectRoot(root: string, resolved: string): void {
  const rootResolved = path.resolve(root);
  const targetResolved = path.resolve(resolved);
  const relative = path.relative(rootResolved, targetResolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
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
