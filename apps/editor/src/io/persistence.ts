import { SCHEMA_VERSION, migrateDocument, type LevelDocument } from "@mmx/content-schema";

/**
 * File access is behind an interface so the desktop (Tauri) build can later drop
 * in native open/save dialogs without touching the editor. The browser
 * implementation uses a download for save and a hidden file input for open.
 */
export interface OpenedFile {
  name: string;
  json: string;
}

export interface FileAccess {
  /** Persist a document's JSON under a suggested filename. */
  save(name: string, json: string): Promise<void>;
  /** Prompt for a file and return its contents, or null if cancelled. */
  open(): Promise<OpenedFile | null>;
}

const RECOVERY_KEY = "mmx-studio.recovery.v1";

export class BrowserFileAccess implements FileAccess {
  async save(name: string, json: string): Promise<void> {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name.endsWith(".json") ? name : `${name}.json`;
    a.click();
    // Revoke on the next tick so the click has consumed the URL first.
    setTimeout(() => URL.revokeObjectURL(url), 0);
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

/** Serialize a document to pretty JSON for download. */
export function serializeDocument(doc: LevelDocument): string {
  return JSON.stringify({ ...doc, schemaVersion: SCHEMA_VERSION }, null, 2);
}

/** Parse + migrate a document from JSON text. Throws on malformed input. */
export function parseDocument(json: string): LevelDocument {
  const raw = JSON.parse(json);
  const doc = migrateDocument(raw);
  if (!Array.isArray(doc.objects) || !Array.isArray(doc.tiles)) {
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
