import { compileLevel, type EngineDiagnostic } from "@mmx/engine/content";
import type { CompiledGameData } from "@mmx/engine/data";
import {
  validateDocument,
  type LevelDocument,
  type ValidateDocumentOptions,
  type ValidationIssue,
  type ValidationResult,
} from "@mmx/content-schema";
import { documentToLevelData } from "./adapters.js";

function mapDiagnostic(d: EngineDiagnostic): ValidationIssue {
  const issue: ValidationIssue = { severity: d.severity, code: d.code, message: d.message };
  if (d.entityId !== undefined) issue.objectId = d.entityId;
  if (d.field !== undefined) issue.field = d.field;
  return issue;
}

/** `gameData`: what Play builds the scene from (the project's), so both agree on enemy kinds. */
export function engineDiagnostics(doc: LevelDocument, gameData?: CompiledGameData): ValidationIssue[] {
  try {
    return compileLevel(documentToLevelData(doc), gameData).diagnostics.map(mapDiagnostic);
  } catch {
    return [];
  }
}

function dedupe(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>();
  const out: ValidationIssue[] = [];
  for (const issue of issues) {
    const key = `${issue.severity}|${issue.code}|${issue.objectId ?? ""}|${issue.field ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(issue);
  }
  return out;
}

/**
 * The engine's "bounds" advisory (an entity wholly outside the level) becomes an error:
 * such an object never participates, so Play refuses to start until it is moved back in.
 */
function outOfBounds(engine: ValidationIssue[]): ValidationIssue[] {
  return engine.map((issue) =>
    issue.code === "bounds"
      ? { ...issue, severity: "error", code: "object.out-of-bounds" }
      : issue,
  );
}

export function validateLevelDocument(
  doc: LevelDocument,
  options?: ValidateDocumentOptions,
  gameData?: CompiledGameData,
): ValidationResult {
  const engine = outOfBounds(engineDiagnostics(doc, gameData));
  const outside = new Set(
    engine.filter((i) => i.code === "object.out-of-bounds").map((i) => i.objectId),
  );
  // The authoring "bounds" warning for the same object would only repeat the error.
  const authoring = validateDocument(doc, options).issues.filter(
    (i) => !(i.code === "bounds" && outside.has(i.objectId)),
  );
  const issues = dedupe([...authoring, ...engine]);
  const errorCount = issues.filter((i) => i.severity === "error").length;
  return {
    issues,
    ok: errorCount === 0,
    errorCount,
    warningCount: issues.length - errorCount,
  };
}
