import { compileLevel, type EngineDiagnostic } from "@mmx/engine/content";
import {
  validateDocument,
  type LevelDocument,
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

/**
 * Engine-side diagnostics for a document, mapped into authoring issues.
 *
 * Returns an empty list when the document cannot even be converted to
 * LevelData (an unknown definition, invalid slope geometry): that failure has
 * an authoring cause which validateDocument already reports.
 */
export function engineDiagnostics(doc: LevelDocument): ValidationIssue[] {
  try {
    return compileLevel(documentToLevelData(doc)).diagnostics.map(mapDiagnostic);
  } catch {
    return [];
  }
}

/** Keep the first occurrence of each (severity, code, object, field) tuple. */
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
 * Full validation for Play mode: authoring checks combined with engine
 * compilation, deduplicated.
 */
export function validateLevelDocument(doc: LevelDocument): ValidationResult {
  const authoring = validateDocument(doc);
  const issues = dedupe([...authoring.issues, ...engineDiagnostics(doc)]);
  const errorCount = issues.filter((i) => i.severity === "error").length;
  return {
    issues,
    ok: errorCount === 0,
    errorCount,
    warningCount: issues.length - errorCount,
  };
}
