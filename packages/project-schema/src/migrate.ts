import { PROJECT_SCHEMA_VERSION } from "./types.js";
import type { ProjectDocument } from "./types.js";

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>;

const MIGRATIONS: Record<number, Migration> = {};

export function migrateProject(raw: unknown): ProjectDocument {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("project-schema: project must be an object.");
  }

  let doc = { ...(raw as Record<string, unknown>) };
  let version = typeof doc.schemaVersion === "number" ? doc.schemaVersion : NaN;

  if (!Number.isInteger(version)) {
    throw new Error("project-schema: schemaVersion must be an integer.");
  }

  if (version > PROJECT_SCHEMA_VERSION) {
    throw new Error(
      `project-schema: project schemaVersion ${version} is newer than supported ${PROJECT_SCHEMA_VERSION}.`,
    );
  }

  while (version < PROJECT_SCHEMA_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) {
      throw new Error(`project-schema: no migration from version ${version}.`);
    }
    doc = step(doc);
    version = typeof doc.schemaVersion === "number" ? doc.schemaVersion : version + 1;
  }

  doc.schemaVersion = PROJECT_SCHEMA_VERSION;
  return doc as unknown as ProjectDocument;
}
