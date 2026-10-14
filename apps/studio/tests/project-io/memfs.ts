import { dirname } from "node:path";

import type { FileSystem, FileStat } from "../../src/project-io/fs.js";
import { normalizeRelativePath } from "../../src/project-io/paths.js";

type Entry =
  | { kind: "file"; content: Uint8Array }
  | { kind: "dir"; children: Map<string, Entry> };

function splitPath(path: string): string[] {
  if (!path || path === ".") return [];
  return normalizeRelativePath(path).split("/").filter(Boolean);
}

function getRoot(store: Map<string, Entry>): Entry {
  const existing = store.get("");
  if (existing?.kind === "dir") return existing;
  const root: Entry = { kind: "dir", children: new Map() };
  store.set("", root);
  return root;
}

function resolveEntry(store: Map<string, Entry>, path: string, create: boolean): Entry {
  const parts = splitPath(path);
  let current = getRoot(store);
  for (const part of parts) {
    const next = current.children.get(part);
    if (!next) {
      if (!create) throw new Error(`ENOENT: ${path}`);
      const created: Entry = { kind: "dir", children: new Map() };
      current.children.set(part, created);
      current = created;
      continue;
    }
    if (next.kind !== "dir") throw new Error(`ENOTDIR: ${path}`);
    current = next;
  }
  return current;
}

function resolveFile(store: Map<string, Entry>, path: string, create: boolean): Entry {
  const parts = splitPath(path);
  if (parts.length === 0) throw new Error(`EISDIR: ${path}`);
  const fileName = parts.pop()!;
  const parent = resolveEntry(store, parts.join("/"), create);
  const existing = parent.children.get(fileName);
  if (existing) return existing;
  if (!create) throw new Error(`ENOENT: ${path}`);
  const created: Entry = { kind: "file", content: new Uint8Array() };
  parent.children.set(fileName, created);
  return created;
}

export function createMemoryFileSystem(initial: Record<string, string | Uint8Array> = {}): FileSystem {
  const store = new Map<string, Entry>();

  for (const [path, value] of Object.entries(initial)) {
    const entry = resolveFile(store, path, true);
    if (entry.kind !== "file") throw new Error(`EISDIR: ${path}`);
    entry.content = typeof value === "string" ? new TextEncoder().encode(value) : value;
  }

  return {
    async readText(path) {
      const entry = resolveFile(store, path, false);
      if (entry.kind !== "file") throw new Error(`EISDIR: ${path}`);
      return new TextDecoder().decode(entry.content);
    },
    async readBytes(path) {
      const entry = resolveFile(store, path, false);
      if (entry.kind !== "file") throw new Error(`EISDIR: ${path}`);
      return entry.content;
    },
    async writeText(path, content) {
      const entry = resolveFile(store, path, true);
      if (entry.kind !== "file") throw new Error(`EISDIR: ${path}`);
      entry.content = new TextEncoder().encode(content);
    },
    async writeBytes(path, content) {
      const entry = resolveFile(store, path, true);
      if (entry.kind !== "file") throw new Error(`EISDIR: ${path}`);
      entry.content = content;
    },
    async exists(path) {
      try {
        resolveFile(store, path, false);
        return true;
      } catch {
        try {
          resolveEntry(store, path, false);
          return true;
        } catch {
          return false;
        }
      }
    },
    async mkdir(path) {
      resolveEntry(store, path, true);
    },
    async copyFile(from, to) {
      const source = resolveFile(store, from, false);
      if (source.kind !== "file") throw new Error(`EISDIR: ${from}`);
      const target = resolveFile(store, to, true);
      if (target.kind !== "file") throw new Error(`EISDIR: ${to}`);
      target.content = source.content.slice();
    },
    async listDir(path) {
      const entry = resolveEntry(store, path, false);
      if (entry.kind !== "dir") throw new Error(`ENOTDIR: ${path}`);
      return [...entry.children.keys()];
    },
    async stat(path): Promise<FileStat> {
      try {
        const file = resolveFile(store, path, false);
        if (file.kind === "file") return { isDirectory: false, isFile: true };
      } catch {
        // fall through
      }
      const dir = resolveEntry(store, path, false);
      if (dir.kind === "dir") return { isDirectory: true, isFile: false };
      throw new Error(`ENOENT: ${path}`);
    },
    async remove(path) {
      const parts = splitPath(path);
      const fileName = parts.pop();
      if (!fileName) {
        store.clear();
        return;
      }
      const parent = resolveEntry(store, parts.join("/"), false);
      if (parent.kind !== "dir") throw new Error(`ENOTDIR: ${path}`);
      parent.children.delete(fileName);
    },
  };
}

export function memoryPath(...segments: string[]): string {
  return dirname(segments.filter(Boolean).join("/").replace(/\\/g, "/"));
}
