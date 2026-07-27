import { migrateProject } from "./migrate.js";
import type { ParseProjectResult, ProjectDocument } from "./types.js";
import { validateProject } from "./validation.js";

export function parseProject(raw: unknown): ParseProjectResult {
  let project: ProjectDocument;
  try {
    project = migrateProject(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      issues: [
        {
          severity: "error",
          code: "schema.parse",
          path: "/schemaVersion",
          message,
        },
      ],
      errorCount: 1,
      warningCount: 0,
    };
  }

  const result = validateProject(project);
  if (!result.ok) {
    return {
      ok: false,
      project,
      issues: result.issues,
      errorCount: result.errorCount,
      warningCount: result.warningCount,
    };
  }

  return {
    ok: true,
    project,
    issues: result.issues,
    errorCount: 0,
    warningCount: result.warningCount,
  };
}
