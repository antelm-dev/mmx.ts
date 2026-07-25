import type { ValidationIssue, ValidationResult } from "./types.js";

/**
 * A tiny schema-driven config validator. A behaviour declares which keys it
 * accepts and of what type; the validator enforces exactly that — required keys
 * present, correct types, and (crucially) *no unknown keys*, so a typo or a
 * stale config field fails compilation rather than being silently dropped.
 */

export type FieldType = "number" | "boolean" | "string" | "number[]" | "tuple2" | "offset";
export type Schema = Readonly<Record<string, FieldType>>;

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
  for (const [key, type] of Object.entries(schema)) {
    const value = record[key];
    if (value === undefined) {
      issues.push({ fieldPath: key, message: `missing config '${key}'.` });
      continue;
    }
    const err = checkField(type, value);
    if (err) issues.push({ fieldPath: key, message: err });
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true, value: record as T };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function checkField(type: FieldType, value: unknown): string | null {
  switch (type) {
    case "number":
      return isFiniteNumber(value) ? null : "must be a finite number.";
    case "boolean":
      return typeof value === "boolean" ? null : "must be a boolean.";
    case "string":
      return typeof value === "string" ? null : "must be a string.";
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
  }
}
