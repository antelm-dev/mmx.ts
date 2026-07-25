import { Registry, notWired, type BehaviorFactory } from "./types.js";
import type { PrefabDefinition } from "../data/types.js";

/**
 * Prefab runtime registry — the spawners a level compiler dispatches to once it
 * has resolved a prefab id, merged defaults, and validated overrides. Part 9
 * wires `create` (spawn the player loadout, an enemy, a pickup, an environment
 * object, or a camera zone).
 */
export type PrefabRuntimeFactory = BehaviorFactory<unknown, PrefabDefinition, unknown>;

const PREFAB_RUNTIME_IDS = ["spawn.player", "enemy", "pickup", "environment", "camera"] as const;

export const prefabRuntimeRegistry = new Registry<PrefabRuntimeFactory>();

for (const id of PREFAB_RUNTIME_IDS) {
  prefabRuntimeRegistry.register({
    id,
    validate: (input) =>
      typeof input === "object" && input !== null
        ? { ok: true, value: input as PrefabDefinition }
        : { ok: false, issues: [{ message: "prefab config must be an object." }] },
    create: () => notWired(id, "Part 9 (Prefabs & level compilation)"),
  });
}
