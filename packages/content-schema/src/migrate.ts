import { SCHEMA_VERSION } from "./types.js";
import type { LevelDocument } from "./types.js";

/**
 * Forward-migration hook for opening older documents.
 *
 * Each entry upgrades a document from version `n` to `n + 1`. There are none yet
 * (the format is at v1), but the seam is here so a future field change is a
 * migration step rather than a breaking read — an unrecognised *newer* version is
 * rejected rather than misread.
 */
type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, Migration> = {
  // 1: (doc) => ({ ...doc, schemaVersion: 2, /* new field */ }),
};

/** Parse and upgrade a raw document to the current schema version. */
export function migrateDocument(raw: unknown): LevelDocument {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("content-schema: document must be an object.");
  }
  let doc = raw as Record<string, unknown>;
  let version = typeof doc.schemaVersion === "number" ? doc.schemaVersion : 1;

  if (version > SCHEMA_VERSION) {
    throw new Error(
      `content-schema: document schemaVersion ${version} is newer than supported ${SCHEMA_VERSION}.`,
    );
  }
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`content-schema: no migration from version ${version}.`);
    doc = step(doc);
    version = typeof doc.schemaVersion === "number" ? doc.schemaVersion : version + 1;
  }
  doc.schemaVersion = SCHEMA_VERSION;
  return doc as unknown as LevelDocument;
}
