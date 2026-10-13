import { compileLevel, type EngineDiagnostic } from "@mmx/engine/content";
import { COMPILED_GAME_DATA, type CompiledGameData } from "@mmx/engine/data";
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

/**
 * `gameData`: what Play builds the scene from (the project's), so both agree on enemy kinds.
 * `enemySheets`: the enemy sheets Play has animations for; when given, a placed enemy whose
 * sheet has none is an error (the scene could not load its clips).
 */
export function engineDiagnostics(
  doc: LevelDocument,
  gameData: CompiledGameData = COMPILED_GAME_DATA,
  enemySheets?: ReadonlySet<string>,
): ValidationIssue[] {
  try {
    const result = compileLevel(documentToLevelData(doc), gameData);
    const issues = result.diagnostics.map(mapDiagnostic);
    if (!result.ok || !enemySheets) return issues;
    for (const enemy of result.value.enemies) {
      const sheet = gameData.enemies.get(enemy.kind)?.sheet;
      if (sheet === undefined || enemySheets.has(sheet)) continue;
      issues.push({
        severity: "error",
        code: "enemy.animation",
        objectId: enemy.id,
        message: `Enemy '${enemy.kind}' has no animation: bind sheet '${sheet}' in game/data.json enemyAnimations.`,
      });
    }
    return issues;
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
  enemySheets?: ReadonlySet<string>,
): ValidationResult {
  const engine = outOfBounds(engineDiagnostics(doc, gameData, enemySheets));
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
