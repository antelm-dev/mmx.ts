import { SCHEMA_VERSION, migrateDocument, type LevelDocument } from "@mmx/content-schema";

/**
 * File access is behind an interface so the browser fallback and the Electron
 * native dialogs are interchangeable. In the Electron shell the preload bridge
 * (`window.studio`) provides real open/save dialogs; if that bridge is absent
 * (e.g. the app opened in a plain browser tab during dev), we fall back to a
 * download for save and a hidden file input for open.
 */
export interface OpenedFile {
  name: string;
  json: string;
}

export interface FileAccess {
  /** Persist a document's JSON under a suggested filename. Returns false if cancelled. */
  save(name: string, json: string): Promise<boolean>;
  /** Prompt for a file and return its contents, or null if cancelled. */
  open(): Promise<OpenedFile | null>;
}

/** `{ rootPath, document }`: the draft and the project it was edited in. */
const RECOVERY_KEY = "mmx-studio.recovery.v2";
/** Older drafts: the document alone, from an unknown project. */
const LEGACY_RECOVERY_KEY = "mmx-studio.recovery.v1";

export interface RecoveryDraft {
  document: LevelDocument;
  /** The open project's root when the draft was written: null for none, undefined when unknown. */
  rootPath: string | null | undefined;
}

/** Native open/save via the Electron preload bridge. */
export class ElectronFileAccess implements FileAccess {
  async save(name: string, json: string): Promise<boolean> {
    const result = await window.studio?.files.saveFile(name, json);
    return result != null;
  }

  async open(): Promise<OpenedFile | null> {
    const result = await window.studio?.files.openFile();
    return result ?? null;
  }
}

/** Browser fallback: download for save, hidden `<input type=file>` for open. */
export class BrowserFileAccess implements FileAccess {
  async save(name: string, json: string): Promise<boolean> {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name.endsWith(".json") ? name : `${name}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  }

  open(): Promise<OpenedFile | null> {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.addEventListener("cancel", () => resolve(null));
      input.addEventListener("change", () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        const reader = new FileReader();
        reader.onload = () => resolve({ name: file.name, json: String(reader.result ?? "") });
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      });
      input.click();
    });
  }
}

/** Pick the best available file backend for the current runtime. */
export function createFileAccess(): FileAccess {
  return typeof window !== "undefined" && window.studio
    ? new ElectronFileAccess()
    : new BrowserFileAccess();
}

/** Serialize a document to pretty JSON for download. */
export function serializeDocument(doc: LevelDocument): string {
  return JSON.stringify({ ...doc, schemaVersion: SCHEMA_VERSION }, null, 2);
}

/** Parse + migrate a document from JSON text. Throws on malformed input. */
export function parseDocument(json: string): LevelDocument {
  return checkDocument(JSON.parse(json));
}

function checkDocument(raw: unknown): LevelDocument {
  const doc = migrateDocument(raw);
  if (!Array.isArray(doc.objects) || !Array.isArray(doc.tiles) || !Array.isArray(doc.decorations)) {
    throw new Error("Not a valid MMX Studio level document.");
  }
  return doc;
}

/**
 * Best-effort local recovery copy, written on every mutation with the open project's root;
 * false when storage refused it.
 */
export function writeRecovery(doc: LevelDocument, rootPath: string | null): boolean {
  try {
    const document = { ...doc, schemaVersion: SCHEMA_VERSION };
    localStorage.setItem(RECOVERY_KEY, JSON.stringify({ rootPath, document }));
    localStorage.removeItem(LEGACY_RECOVERY_KEY);
    return true;
  } catch {
    // Storage full or blocked (private mode) — recovery is best-effort.
    return false;
  }
}

/** The recovery draft, or null when there is none or it cannot be read. */
export function readRecovery(): RecoveryDraft | null {
  try {
    const json = localStorage.getItem(RECOVERY_KEY);
    if (json) {
      const { rootPath, document } = JSON.parse(json) as Record<string, unknown>;
      // Anything but a string or null is an unknown origin, so it never replaces a level.
      const origin = typeof rootPath === "string" || rootPath === null ? rootPath : undefined;
      return { document: checkDocument(document), rootPath: origin };
    }
    const legacy = localStorage.getItem(LEGACY_RECOVERY_KEY);
    return legacy ? { document: parseDocument(legacy), rootPath: undefined } : null;
  } catch {
    return null;
  }
}

export function clearRecovery(): void {
  try {
    localStorage.removeItem(RECOVERY_KEY);
    localStorage.removeItem(LEGACY_RECOVERY_KEY);
  } catch {
    // ignore
  }
}
