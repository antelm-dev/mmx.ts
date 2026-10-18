import type { EnvironmentDefinition } from "./types.js";

/**
 * The engine's own environment definitions: hazards and camera zones. Platforms and
 * conveyors are project data (the MMX Starter pack). The movement/collection/
 * constraint algorithms stay in code (Environment.ts, Camera.ts); the definition
 * carries the runtime behaviour id and the default field values a level instance
 * overrides.
 *
 * Defaults match the level compiler's current fallbacks so an authored object
 * that omits a field behaves exactly as it does today.
 */
export const environments = {
  hazard: {
    id: "hazard",
    behavior: "environment.hazard",
    defaults: { lethal: true, damage: 4 },
  },
  "camera-zone": {
    id: "camera-zone",
    behavior: "environment.camera-zone",
    defaults: { bindX: true, bindY: true },
  },
} satisfies Record<string, EnvironmentDefinition>;
