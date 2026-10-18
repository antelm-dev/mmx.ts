import type { PrefabDefinition } from "./types.js";

/**
 * Level-facing prefabs — the stable spawnables a {@link LevelEntity.prefabId}
 * references. Each resolves to a runtime spawner (by `runtime` id) and to one of
 * the definition categories, and declares the typed override fields it exposes to
 * a level author. Prefab ids are the level-facing definition ids: content-schema
 * generates its object catalog from these records (`definitionsFromGameData`).
 */
export const prefabs = {
  spawn: {
    id: "spawn",
    name: "Spawn",
    runtime: "spawn.player",
    source: { kind: "loadout", ref: "player.x" },
    fields: [],
  },
  hazard: {
    id: "hazard",
    name: "Hazard",
    description:
      "Spikes: touching them kills the player unless he is invulnerable; with Lethal off they deal Damage instead.",
    runtime: "environment",
    source: { kind: "environment", ref: "hazard" },
    fields: [
      { name: "Lethal", type: "boolean", default: true },
      { name: "Damage", type: "number", default: 4, min: 1 },
    ],
  },
  "camera-zone": {
    id: "camera-zone",
    name: "Camera Zone",
    description: "Keeps the camera inside its area while the player is in it.",
    runtime: "camera",
    source: { kind: "environment", ref: "camera-zone" },
    fields: [
      { name: "BindX", type: "boolean", default: true },
      { name: "BindY", type: "boolean", default: true },
    ],
  },
} satisfies Record<string, PrefabDefinition>;
