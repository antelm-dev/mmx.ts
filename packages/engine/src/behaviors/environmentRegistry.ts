import { Registry, notWired, type BehaviorFactory } from "./types.js";
import { validateConfig, type Schema } from "./configValidation.js";
import type { DebugPrimitive, EntityTransform } from "./geometryTypes.js";
import type { EnvironmentDefinition } from "../data/types.js";

/** A placed environment instance's field values, keyed by prefab field name (Travel, Axis…). */
export type EnvironmentFields = Readonly<Record<string, unknown>>;

/**
 * Environment behaviour registry — moving and falling platforms, conveyors,
 * hazards, and camera zones. The movement/constraint algorithms stay in code
 * (Environment.ts, Camera.ts); an entry names which one runs and validates a
 * definition's `defaults`, the values the level compiler falls back to for an
 * omitted field. Part 8 wires `create`.
 *
 * `debugGeometry` describes one placed instance for the editor: `fields` are
 * its resolved prefab field values (prefab defaults merged with the instance's
 * overrides) and the transform is its rectangle, `x`/`y` its top-left corner.
 * `defaults` are the resolved environment definition's (the project's data), for
 * a field the instance leaves unset.
 */
export interface EnvironmentBehaviorFactory extends Omit<
  BehaviorFactory<unknown, EnvironmentDefinition["defaults"], unknown>,
  "debugGeometry"
> {
  debugGeometry?(
    fields: EnvironmentFields,
    transform: EntityTransform,
    defaults?: EnvironmentDefinition["defaults"],
  ): readonly DebugPrimitive[];
}

/** Each behaviour's `defaults` schema. */
const DEFAULTS_SCHEMAS = {
  "environment.moving-platform": {
    travel: { type: "number", min: 0 },
    speed: { type: "number", min: 0 },
  },
  "environment.falling-platform": { delay: { type: "number", min: 0 } },
  "environment.conveyor": { speed: "number" },
  "environment.hazard": { lethal: "boolean", damage: { type: "number", min: 1, optional: true } },
  "environment.camera-zone": { bindX: "boolean", bindY: "boolean" },
} as const satisfies Readonly<Record<string, Schema>>;

/**
 * A moving platform's travel: a path from its rectangle's centre at the origin
 * to its centre at the far end, and the rectangle at the far end (the handle a
 * gizmo drags to set Travel). Empty when it does not travel.
 */
function movingPlatformGeometry(
  fields: EnvironmentFields,
  transform: EntityTransform,
  defaults?: EnvironmentDefinition["defaults"],
): DebugPrimitive[] {
  const travel =
    typeof fields.Travel === "number" ? Math.max(0, fields.Travel) : Number(defaults?.travel ?? 0);
  if (!(travel > 0)) return [];
  const vertical = fields.Axis === "vertical";
  const width = transform.width ?? 0;
  const height = transform.height ?? 0;
  const endX = transform.x + (vertical ? 0 : travel);
  const endY = transform.y + (vertical ? travel : 0);
  return [
    {
      kind: "line",
      role: "movement-path",
      from: { x: transform.x + width / 2, y: transform.y + height / 2 },
      to: { x: endX + width / 2, y: endY + height / 2 },
    },
    { kind: "rect", role: "movement-path", x: endX, y: endY, width, height, label: "end" },
  ];
}

export const environmentBehaviorRegistry = new Registry<EnvironmentBehaviorFactory>();

for (const [id, schema] of Object.entries(DEFAULTS_SCHEMAS)) {
  environmentBehaviorRegistry.register({
    id,
    validate: (input) => validateConfig<EnvironmentDefinition["defaults"]>(schema, input),
    create: () => notWired(id, "Part 8 (Pickups & environment)"),
    ...(id === "environment.moving-platform" ? { debugGeometry: movingPlatformGeometry } : {}),
  });
}
