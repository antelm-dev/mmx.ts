import { effectiveValue, getDefinition, instanceSize } from "./definitions.js";
import type {
  LevelDocument,
  LevelObjectInstance,
  ValidationIssue,
  ValidationResult,
} from "./types.js";

/**
 * Static checks run before a save and before entering Play mode. Errors block
 * Play (a level the engine would refuse to load, or crash on); warnings are
 * advisory (an object drifted off the map) and never block.
 *
 * The set mirrors the invariants `packages/engine/src/game/level.ts` enforces at
 * load time — exactly one Spawn, known enemy/pickup kinds, finite fields — so the
 * editor surfaces them at authoring time instead of as a thrown error on Play.
 */

const SUPPORTED_ENEMY_KINDS = new Set(["metool", "bat"]);
const SUPPORTED_PICKUP_KINDS = new Set(["small", "large"]);

function boxOf(inst: LevelObjectInstance): { x: number; y: number; w: number; h: number } {
  const { width, height } = instanceSize(inst);
  return { x: inst.x, y: inst.y, w: width, h: height };
}

/** Validate a whole document, returning every issue found. */
export function validateDocument(doc: LevelDocument): ValidationResult {
  const issues: ValidationIssue[] = [];
  const add = (issue: ValidationIssue): void => {
    issues.push(issue);
  };

  // --- Grid integrity ---
  if (doc.tiles.length !== doc.cols * doc.rows) {
    add({
      severity: "error",
      code: "tiles.length",
      message: `tiles.length is ${doc.tiles.length}, expected cols*rows = ${doc.cols * doc.rows}.`,
    });
  }
  if (!Number.isFinite(doc.cols) || !Number.isFinite(doc.rows) || doc.cols <= 0 || doc.rows <= 0) {
    add({ severity: "error", code: "grid.size", message: "cols and rows must be positive." });
  }

  // --- Unique ids ---
  const seen = new Set<string>();
  for (const obj of doc.objects) {
    if (seen.has(obj.id)) {
      add({
        severity: "error",
        code: "id.duplicate",
        objectId: obj.id,
        message: `Duplicate object id '${obj.id}'.`,
      });
    }
    seen.add(obj.id);
  }

  // --- Spawn cardinality ---
  const spawnCount = doc.objects.filter((o) => o.definitionId === "spawn").length;
  if (spawnCount !== 1) {
    add({
      severity: "error",
      code: "spawn.count",
      message: `Expected exactly one Spawn, found ${spawnCount}.`,
    });
  }

  const worldW = doc.cols * doc.gridSize;
  const worldH = doc.rows * doc.gridSize;
  const margin = doc.gridSize;

  for (const obj of doc.objects) {
    const def = getDefinition(obj.definitionId);
    if (!def) {
      add({
        severity: "error",
        code: "definition.unknown",
        objectId: obj.id,
        message: `Unknown object definition '${obj.definitionId}'.`,
      });
      continue;
    }

    // Transform must be finite.
    for (const [key, value] of Object.entries({
      x: obj.x,
      y: obj.y,
      width: obj.width ?? def.defaultSize.width,
      height: obj.height ?? def.defaultSize.height,
      rotation: obj.rotation ?? 0,
    })) {
      if (!Number.isFinite(value)) {
        add({
          severity: "error",
          code: "transform.finite",
          objectId: obj.id,
          field: key,
          message: `${def.name}: ${key} must be a finite number.`,
        });
      }
    }

    // Positive dimensions for resizable objects (platforms, hazards, camera zones…).
    if (def.editor.resizable) {
      const { w, h } = boxOf(obj);
      if (!(w > 0) || !(h > 0)) {
        add({
          severity: "error",
          code: "size.positive",
          objectId: obj.id,
          field: w > 0 ? "height" : "width",
          message: `${def.name}: width and height must be positive.`,
        });
      }
    }

    // Kind support (redundant with the definition catalog, but a clear message).
    if (def.category === "enemy" && !SUPPORTED_ENEMY_KINDS.has(String(def.fields.Kind))) {
      add({
        severity: "error",
        code: "enemy.kind",
        objectId: obj.id,
        message: `Unsupported enemy kind '${String(def.fields.Kind)}'.`,
      });
    }
    if (def.category === "pickup" && !SUPPORTED_PICKUP_KINDS.has(String(def.fields.Kind))) {
      add({
        severity: "error",
        code: "pickup.kind",
        objectId: obj.id,
        message: `Unsupported pickup kind '${String(def.fields.Kind)}'.`,
      });
    }

    // Per-property checks driven by the definition metadata.
    for (const prop of def.properties) {
      const value = effectiveValue(obj, prop.key);
      if (prop.type === "number") {
        if (typeof value !== "number" || !Number.isFinite(value)) {
          add({
            severity: "error",
            code: "field.number",
            objectId: obj.id,
            field: prop.key,
            message: `${def.name}: ${prop.label} must be a finite number.`,
          });
        } else if (prop.nonNegative && value < 0) {
          add({
            severity: "error",
            code: "field.nonNegative",
            objectId: obj.id,
            field: prop.key,
            message: `${def.name}: ${prop.label} must be ≥ 0.`,
          });
        }
      } else if (prop.type === "enum") {
        if (!prop.options?.includes(String(value))) {
          add({
            severity: "error",
            code: "field.enum",
            objectId: obj.id,
            field: prop.key,
            message: `${def.name}: ${prop.label} '${String(value)}' is not one of ${prop.options?.join(", ")}.`,
          });
        }
      } else if (prop.type === "boolean") {
        if (typeof value !== "boolean") {
          add({
            severity: "error",
            code: "field.boolean",
            objectId: obj.id,
            field: prop.key,
            message: `${def.name}: ${prop.label} must be true or false.`,
          });
        }
      }
    }

    // Bounds — advisory only, so an off-map object does not block Play.
    const box = boxOf(obj);
    if (
      box.x < -margin ||
      box.y < -margin ||
      box.x + box.w > worldW + margin ||
      box.y + box.h > worldH + margin
    ) {
      add({
        severity: "warning",
        code: "bounds",
        objectId: obj.id,
        message: `${def.name} lies outside the level bounds.`,
      });
    }
  }

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.length - errorCount;
  return { issues, ok: errorCount === 0, errorCount, warningCount };
}
