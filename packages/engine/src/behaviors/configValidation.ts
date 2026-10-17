import type { ValidationIssue, ValidationResult } from "./types.js";

/**
 * A tiny schema-driven config validator. A behaviour declares which keys it
 * accepts and of what type; the validator enforces exactly that — required keys
 * present, correct types, and (crucially) *no unknown keys*, so a typo or a
 * stale config field fails compilation rather than being silently dropped.
 */

export type FieldType =
  | "number"
  | "boolean"
  | "string"
  | "string[]"
  | "number[]"
  | "tuple2"
  | "offset"
  | "slashStep";

/** The exact keys of a `slashStep` (data/types.ts SlashStep). */
const SLASH_STEP_NUMBERS = ["duration", "activeFrom", "activeTo", "damage", "chainWindow"];
const BOX_KEYS = ["x", "y", "w", "h"];
/**
 * A field with bounds, for numbers an editor should clamp (both ends inclusive).
 * `optional` lets a config omit the key, so a field added to an existing
 * behaviour leaves every config written before it (and its hash) untouched.
 */
export interface FieldSpec {
  type: FieldType;
  min?: number;
  max?: number;
  optional?: boolean;
}
export type Schema = Readonly<Record<string, FieldType | FieldSpec>>;

export function validateConfig<T>(schema: Schema, input: unknown): ValidationResult<T> {
  const obj = input ?? {};
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    return { ok: false, issues: [{ message: "config must be an object." }] };
  }
  const record = obj as Record<string, unknown>;
  const issues: ValidationIssue[] = [];

  for (const key of Object.keys(record)) {
    if (!(key in schema)) {
      issues.push({ fieldPath: key, message: `unknown config key '${key}'.` });
    }
  }
  for (const [key, field] of Object.entries(schema)) {
    const value = record[key];
    const spec: FieldSpec = typeof field === "string" ? { type: field } : field;
    if (value === undefined) {
      if (!spec.optional) issues.push({ fieldPath: key, message: `missing config '${key}'.` });
      continue;
    }
    const err = checkField(spec.type, value) ?? checkRange(spec, value as number);
    if (err) issues.push({ fieldPath: key, message: err });
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true, value: record as T };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function checkRange(spec: FieldSpec, value: number): string | null {
  if (spec.min !== undefined && value < spec.min) return `must be >= ${spec.min}.`;
  if (spec.max !== undefined && value > spec.max) return `must be <= ${spec.max}.`;
  return null;
}

function checkField(type: FieldType, value: unknown): string | null {
  switch (type) {
    case "number":
      return isFiniteNumber(value) ? null : "must be a finite number.";
    case "boolean":
      return typeof value === "boolean" ? null : "must be a boolean.";
    case "string":
      return typeof value === "string" ? null : "must be a string.";
    case "string[]":
      return Array.isArray(value) && value.every((v) => typeof v === "string")
        ? null
        : "must be an array of strings.";
    case "number[]":
      return Array.isArray(value) && value.every(isFiniteNumber)
        ? null
        : "must be an array of finite numbers.";
    case "tuple2":
      return Array.isArray(value) && value.length === 2 && value.every(isFiniteNumber)
        ? null
        : "must be a pair of finite numbers.";
    case "offset":
      return typeof value === "object" &&
        value !== null &&
        isFiniteNumber((value as { x: unknown }).x) &&
        isFiniteNumber((value as { y: unknown }).y)
        ? null
        : "must be an { x, y } offset.";
    case "slashStep":
      return checkSlashStep(value);
  }
}

function hasExactly(v: unknown, keys: string[]): v is Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const own = Object.keys(v);
  return own.length === keys.length && keys.every((k) => own.includes(k));
}

function checkSlashStep(v: unknown): string | null {
  const keys = ["animation", "hitbox", ...SLASH_STEP_NUMBERS];
  const shape = `must be { ${keys.join(", ")} } with hitbox { x, y, w, h }.`;
  if (!hasExactly(v, keys) || typeof v.animation !== "string") return shape;
  if (!SLASH_STEP_NUMBERS.every((k) => isFiniteNumber(v[k]))) return shape;
  const box = v.hitbox;
  if (!hasExactly(box, BOX_KEYS) || !BOX_KEYS.every((k) => isFiniteNumber(box[k]))) return shape;
  if ((box.w as number) <= 0 || (box.h as number) <= 0) return "hitbox w and h must be > 0.";
  const [from, to, duration] = [v.activeFrom, v.activeTo, v.duration] as number[];
  if (!(0 <= from && from <= to && to < duration)) {
    return "needs 0 <= activeFrom <= activeTo < duration.";
  }
  return null;
}
