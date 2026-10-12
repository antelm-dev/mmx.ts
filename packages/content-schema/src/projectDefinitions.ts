import { OBJECT_DEFINITIONS, replaceProjectDefinitions } from "./definitions.js";
import type { GameObjectDefinition, PropertyMeta } from "./types.js";
import { propertyIssue } from "./validation.js";

/**
 * A project object definition (the manifest's `objects[]`): a built-in
 * definition (`base`) with some property values fixed and only `exposed`
 * properties editable per instance (all of them when absent).
 */
export interface ProjectDefinitionEntry {
  id: string;
  name: string;
  base: string;
  values?: Record<string, unknown>;
  exposed?: readonly string[];
}

export interface ProjectDefinitionIssue {
  /** Index in the entries array. */
  index: number;
  code: string;
  field?: string;
  message: string;
}

const BUILTIN = new Map(OBJECT_DEFINITIONS.map((d) => [d.id, d]));

/**
 * Resolves an entry against its base: exposed properties keep their control
 * with `values` as the new default; the others become fixed engine fields.
 */
export function deriveDefinition(
  entry: ProjectDefinitionEntry,
  base: GameObjectDefinition,
): GameObjectDefinition {
  const exposed = (key: string) => entry.exposed?.includes(key) ?? true;
  const fields: Record<string, unknown> = { ...base.fields };
  const properties: PropertyMeta[] = [];
  for (const prop of base.properties) {
    const value = entry.values?.[prop.key] ?? prop.default;
    if (exposed(prop.key)) properties.push({ ...prop, default: value });
    else fields[prop.key] = value;
  }
  return { ...base, id: entry.id, name: entry.name, baseId: base.id, fields, properties };
}

/** Semantic checks the manifest schema cannot make: base, keys and values against the catalog. */
export function projectDefinitionIssues(
  entries: readonly ProjectDefinitionEntry[],
): ProjectDefinitionIssue[] {
  const issues: ProjectDefinitionIssue[] = [];
  entries.forEach((entry, index) => {
    const add = (code: string, message: string, field?: string) =>
      issues.push({ index, code, message, ...(field !== undefined ? { field } : {}) });
    if (BUILTIN.has(entry.id)) {
      add("object.id.reserved", `'${entry.id}' is a built-in object id.`, "id");
    }
    const base = BUILTIN.get(entry.base);
    if (!base || base.id === "spawn") {
      add("object.base", `'${entry.base}' is not a built-in object this can derive from.`, "base");
      return;
    }
    const keys = new Set(base.properties.map((p) => p.key));
    for (const key of entry.exposed ?? []) {
      if (!keys.has(key))
        add("object.exposed", `${base.name} has no property '${key}'.`, "exposed");
    }
    for (const [key, value] of Object.entries(entry.values ?? {})) {
      const prop = base.properties.find((p) => p.key === key);
      if (!prop) {
        add("object.values", `${base.name} has no property '${key}'.`, "values");
        continue;
      }
      const issue = propertyIssue(prop, value);
      if (issue) add(issue.code, `${entry.name}: ${issue.message}`, "values");
    }
  });
  return issues;
}

/**
 * Validates the open project's definitions and makes the valid ones visible to
 * every catalog lookup (palette, validation, compilation). Returns the issues
 * of the entries it skipped.
 */
export function setProjectDefinitions(
  entries: readonly ProjectDefinitionEntry[],
): ProjectDefinitionIssue[] {
  const issues = projectDefinitionIssues(entries);
  const skipped = new Set(issues.map((issue) => issue.index));
  replaceProjectDefinitions(
    entries.flatMap((entry, index) =>
      skipped.has(index) ? [] : [deriveDefinition(entry, BUILTIN.get(entry.base)!)],
    ),
  );
  return issues;
}
