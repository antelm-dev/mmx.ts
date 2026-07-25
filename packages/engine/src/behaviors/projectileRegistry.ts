import { Registry, notWired, type BehaviorFactory } from "./types.js";
import type { ProjectileDefinition } from "../data/types.js";

/**
 * Projectile movement behaviours. Every current shot flies straight, so there is
 * one entry; homing/boomerang/tracking variants would be new registered entries,
 * not new data fields. The projectile's stats are the ProjectileDefinition
 * itself (validated by compileGameData), so the config validator accepts the
 * definition shape as-is; Part 7 wires `create`.
 */
export type ProjectileBehaviorFactory = BehaviorFactory<unknown, ProjectileDefinition, unknown>;

export const projectileBehaviorRegistry = new Registry<ProjectileBehaviorFactory>();

projectileBehaviorRegistry.register({
  id: "projectile.straight",
  validate: (input) =>
    typeof input === "object" && input !== null
      ? { ok: true, value: input as ProjectileDefinition }
      : { ok: false, issues: [{ message: "projectile config must be an object." }] },
  create: () => notWired("projectile.straight", "Part 7 (Weapons & projectiles)"),
});
