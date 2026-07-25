import type { EnvironmentDefinition } from "./types.js";

/**
 * Environment object definitions — moving platforms, conveyors, hazards, and
 * camera zones. The movement/collection/constraint algorithms stay in code
 * (Environment.ts, Camera.ts); the definition carries the runtime behaviour id
 * and the default field values a level instance overrides.
 *
 * Defaults match the level compiler's current fallbacks so an authored object
 * that omits a field behaves exactly as it does today.
 */
export const environments = {
  "moving-platform": {
    id: "moving-platform",
    behavior: "environment.moving-platform",
    defaults: { travel: 96, speed: 48 },
  },
  conveyor: {
    id: "conveyor",
    behavior: "environment.conveyor",
    defaults: { speed: 60 },
  },
  hazard: {
    id: "hazard",
    behavior: "environment.hazard",
    defaults: { lethal: true },
  },
  "camera-zone": {
    id: "camera-zone",
    behavior: "environment.camera-zone",
    defaults: { bindX: true, bindY: true },
  },
} satisfies Record<string, EnvironmentDefinition>;
