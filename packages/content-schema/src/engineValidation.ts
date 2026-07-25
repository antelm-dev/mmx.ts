import { compileLevel, type EngineDiagnostic } from "@mmx/engine/content";
import { documentToLevelData } from "./adapters.js";
import { validateDocument } from "./validation.js";
import type { LevelDocument, ValidationIssue, ValidationResult } from "./types.js";

/**
 * The bridge between authoring validation and the engine's level compiler.
 *
 * The two checks overlap by design — the authoring rules in ./validation.ts were
 * written to mirror the engine's load-time invariants — so this module runs both
 * and reconciles them: engine diagnostics are mapped onto {@link ValidationIssue}
 * (entityId → objectId, field → field, code and severity preserved), then merged
 * with the authoring issues and deduplicated. Engine errors block Play the same
 * way authoring errors do; engine warnings never block.
 *
 * The dependency points one way only: content-schema depends on the engine's
 * compile API, and the engine knows nothing of this package.
 */

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
 * {@link import("@mmx/engine/game/LevelData.js").LevelData} (an unknown
 * definition, invalid slope geometry): that failure has an authoring cause which
 * {@link validateDocument} already reports, so there is nothing to add here.
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
 * compilation, deduplicated. This is what the editor gates Play on, so an
 * engine-only error (something the authoring pass does not model) still blocks.
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
