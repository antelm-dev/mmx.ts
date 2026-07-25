import { Registry, notWired, type BehaviorFactory } from "./types.js";
import type { EnvironmentDefinition } from "../data/types.js";

/**
 * Environment behaviour registry — moving platforms, conveyors, hazards, and
 * camera zones. The movement/constraint algorithms stay in code (Environment.ts,
 * Camera.ts); an entry names which one runs. Part 8 wires `create`, and Part 11
 * adds the `debugGeometry` providers (travel paths, influence areas, zones).
 */
export type EnvironmentBehaviorFactory = BehaviorFactory<unknown, EnvironmentDefinition, unknown>;

const ENVIRONMENT_BEHAVIOR_IDS = [
  "environment.moving-platform",
  "environment.conveyor",
  "environment.hazard",
  "environment.camera-zone",
] as const;

export const environmentBehaviorRegistry = new Registry<EnvironmentBehaviorFactory>();

for (const id of ENVIRONMENT_BEHAVIOR_IDS) {
  environmentBehaviorRegistry.register({
    id,
    validate: (input) =>
      typeof input === "object" && input !== null
        ? { ok: true, value: input as EnvironmentDefinition }
        : { ok: false, issues: [{ message: "environment config must be an object." }] },
    create: () => notWired(id, "Part 8 (Pickups & environment)"),
  });
}
