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

const RECOVERY_KEY = "mmx-studio.recovery.v1";

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
  const raw = JSON.parse(json);
  const doc = migrateDocument(raw);
  if (!Array.isArray(doc.objects) || !Array.isArray(doc.tiles) || !Array.isArray(doc.decorations)) {
    throw new Error("Not a valid MMX Studio level document.");
  }
  return doc;
}

/** Best-effort local recovery copy, written on every mutation. */
export function writeRecovery(doc: LevelDocument): void {
  try {
    localStorage.setItem(RECOVERY_KEY, serializeDocument(doc));
  } catch {
    // Storage full or blocked (private mode) — recovery is best-effort.
  }
}

export function readRecovery(): LevelDocument | null {
  try {
    const json = localStorage.getItem(RECOVERY_KEY);
    return json ? parseDocument(json) : null;
  } catch {
    return null;
  }
}

export function clearRecovery(): void {
  try {
    localStorage.removeItem(RECOVERY_KEY);
  } catch {
    // ignore
  }
}

export function hasRecovery(): boolean {
  try {
    return localStorage.getItem(RECOVERY_KEY) != null;
  } catch {
    return false;
  }
}

export function readRecoveryJson(): string | null {
  try {
    return localStorage.getItem(RECOVERY_KEY);
  } catch {
    return null;
  }
}
