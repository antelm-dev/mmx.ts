import { compileLevel, type EngineDiagnostic } from "@mmx/engine/content";
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

export function engineDiagnostics(doc: LevelDocument): ValidationIssue[] {
  try {
    return compileLevel(documentToLevelData(doc)).diagnostics.map(mapDiagnostic);
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

export function validateLevelDocument(
  doc: LevelDocument,
  options?: ValidateDocumentOptions,
): ValidationResult {
  const authoring = validateDocument(doc, options);
  const issues = dedupe([...authoring.issues, ...engineDiagnostics(doc)]);
  const errorCount = issues.filter((i) => i.severity === "error").length;
  return {
    issues,
    ok: errorCount === 0,
    errorCount,
    warningCount: issues.length - errorCount,
  };
}
