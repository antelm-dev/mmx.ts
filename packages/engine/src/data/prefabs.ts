import type { PrefabDefinition } from "./types.js";

/**
 * Level-facing prefabs — the stable spawnables a {@link LevelEntity.prefabId}
 * references. Each resolves to a runtime spawner (by `runtime` id) and to one of
 * the definition categories, and declares the typed override fields it exposes to
 * a level author. The legacy LDtk-name mapping (Enemy+Kind=metool → enemy.metool
 * and friends) lives at the level-compiler boundary, not here.
 */
export const prefabs = {
  "spawn.player": {
    id: "spawn.player",
    runtime: "spawn.player",
    source: { kind: "loadout", ref: "player.x" },
    fields: [],
  },
  "enemy.metool": {
    id: "enemy.metool",
    runtime: "enemy",
    source: { kind: "enemy", ref: "metool" },
    fields: [{ name: "FacesRight", type: "boolean", default: false }],
  },
  "enemy.bat": {
    id: "enemy.bat",
    runtime: "enemy",
    source: { kind: "enemy", ref: "bat" },
    fields: [{ name: "FacesRight", type: "boolean", default: false }],
  },
  "pickup.life.small": {
    id: "pickup.life.small",
    runtime: "pickup",
    source: { kind: "pickup", ref: "life.small" },
    fields: [],
  },
  "pickup.life.large": {
    id: "pickup.life.large",
    runtime: "pickup",
    source: { kind: "pickup", ref: "life.large" },
    fields: [],
  },
  "pickup.weapon.small": {
    id: "pickup.weapon.small",
    runtime: "pickup",
    source: { kind: "pickup", ref: "weapon.small" },
    fields: [],
  },
  "pickup.weapon.large": {
    id: "pickup.weapon.large",
    runtime: "pickup",
    source: { kind: "pickup", ref: "weapon.large" },
    fields: [],
  },
  "environment.moving-platform": {
    id: "environment.moving-platform",
    runtime: "environment",
    source: { kind: "environment", ref: "moving-platform" },
    fields: [
      { name: "Travel", type: "number", default: 96, min: 0 },
      { name: "Speed", type: "number", default: 48, min: 0 },
    ],
  },
  "environment.conveyor": {
    id: "environment.conveyor",
    runtime: "environment",
    source: { kind: "environment", ref: "conveyor" },
    fields: [{ name: "Speed", type: "number", default: 60 }],
  },
  "environment.hazard": {
    id: "environment.hazard",
    runtime: "environment",
    source: { kind: "environment", ref: "hazard" },
    fields: [],
  },
  "camera.zone": {
    id: "camera.zone",
    runtime: "camera",
    source: { kind: "environment", ref: "camera-zone" },
    fields: [
      { name: "BindX", type: "boolean", default: true },
      { name: "BindY", type: "boolean", default: true },
    ],
  },
} satisfies Record<string, PrefabDefinition>;
