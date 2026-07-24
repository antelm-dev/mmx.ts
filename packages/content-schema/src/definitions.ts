import type { GameObjectDefinition, LevelObjectInstance } from "./types.js";

/**
 * The catalog of every authorable object, one definition per palette entry.
 *
 * Kind is folded into the definition identity rather than left as an editable
 * field: a Metool and a Bat are two palette entries (`enemy.metool` /
 * `enemy.bat`), so "change this enemy's kind" is "swap its definition", which is
 * exactly what the engine's `loadLevel` validates the `Kind` field against. The
 * remaining `properties` are the per-instance overrides the inspector edits.
 *
 * `engineId` is the LDtk entity id the adapter emits, so these stay in lockstep
 * with what `packages/engine/src/game/level.ts` reads.
 */

const COLORS = {
  spawn: "#38bdf8",
  enemy: "#f97316",
  pickup: "#22c55e",
  platform: "#eab308",
  conveyor: "#14b8a6",
  hazard: "#ef4444",
  slope: "#a855f7",
  camera: "#6366f1",
} as const;

export const OBJECT_DEFINITIONS: readonly GameObjectDefinition[] = [
  {
    id: "spawn",
    name: "Spawn",
    category: "spawn",
    icon: "◎",
    engineId: "Spawn",
    components: { player: {} },
    fields: {},
    defaultSize: { width: 16, height: 16 },
    editor: { placement: "point", color: COLORS.spawn },
    properties: [],
  },
  {
    id: "enemy.metool",
    name: "Metool",
    category: "enemy",
    icon: "▲",
    engineId: "Enemy",
    components: { enemy: { kind: "metool" } },
    fields: { Kind: "metool", FacesRight: false },
    defaultSize: { width: 16, height: 16 },
    editor: { placement: "point", color: COLORS.enemy },
    properties: [
      {
        key: "FacesRight",
        label: "Faces Right",
        type: "boolean",
        default: false,
        help: "Initial spawn facing (unchecked faces left).",
      },
    ],
  },
  {
    id: "enemy.bat",
    name: "Bat",
    category: "enemy",
    icon: "ᗢ",
    engineId: "Enemy",
    components: { enemy: { kind: "bat" } },
    fields: { Kind: "bat", FacesRight: false },
    defaultSize: { width: 16, height: 16 },
    editor: { placement: "point", color: COLORS.enemy },
    properties: [{ key: "FacesRight", label: "Faces Right", type: "boolean", default: false }],
  },
  {
    id: "pickup.life.small",
    name: "Life Capsule (Small)",
    category: "pickup",
    icon: "＋",
    engineId: "LifeCapsule",
    components: { pickup: { kind: "life", size: "small" } },
    fields: { Kind: "small" },
    defaultSize: { width: 16, height: 16 },
    editor: { placement: "point", color: COLORS.pickup },
    properties: [],
  },
  {
    id: "pickup.life.large",
    name: "Life Capsule (Large)",
    category: "pickup",
    icon: "✚",
    engineId: "LifeCapsule",
    components: { pickup: { kind: "life", size: "large" } },
    fields: { Kind: "large" },
    defaultSize: { width: 16, height: 16 },
    editor: { placement: "point", color: COLORS.pickup },
    properties: [],
  },
  {
    id: "pickup.weapon.small",
    name: "Weapon Capsule (Small)",
    category: "pickup",
    icon: "◇",
    engineId: "WeaponCapsule",
    components: { pickup: { kind: "weapon", size: "small" } },
    fields: { Kind: "small" },
    defaultSize: { width: 16, height: 16 },
    editor: { placement: "point", color: COLORS.pickup },
    properties: [],
  },
  {
    id: "pickup.weapon.large",
    name: "Weapon Capsule (Large)",
    category: "pickup",
    icon: "◆",
    engineId: "WeaponCapsule",
    components: { pickup: { kind: "weapon", size: "large" } },
    fields: { Kind: "large" },
    defaultSize: { width: 16, height: 16 },
    editor: { placement: "point", color: COLORS.pickup },
    properties: [],
  },
  {
    id: "platform.moving",
    name: "Moving Platform",
    category: "platform",
    icon: "▭",
    engineId: "MovingPlatform",
    components: { platform: { moving: true } },
    fields: { Travel: 96, Speed: 48 },
    defaultSize: { width: 48, height: 8 },
    editor: { placement: "rectangle", resizable: true, color: COLORS.platform },
    properties: [
      {
        key: "Travel",
        label: "Travel",
        type: "number",
        default: 96,
        nonNegative: true,
        help: "Horizontal travel distance in pixels.",
      },
      {
        key: "Speed",
        label: "Speed",
        type: "number",
        default: 48,
        nonNegative: true,
        help: "Travel speed in pixels/second.",
      },
    ],
  },
  {
    id: "conveyor",
    name: "Conveyor",
    category: "conveyor",
    icon: "⇥",
    engineId: "Conveyor",
    components: { conveyor: {} },
    fields: { Speed: 60 },
    defaultSize: { width: 64, height: 8 },
    editor: { placement: "rectangle", resizable: true, color: COLORS.conveyor },
    properties: [
      {
        key: "Speed",
        label: "Speed",
        type: "number",
        default: 60,
        help: "Belt speed in pixels/second; negative pushes left.",
      },
    ],
  },
  {
    id: "hazard",
    name: "Hazard",
    category: "hazard",
    icon: "☠",
    engineId: "Hazard",
    components: { hazard: { lethal: true } },
    fields: {},
    defaultSize: { width: 16, height: 16 },
    editor: { placement: "rectangle", resizable: true, color: COLORS.hazard },
    properties: [],
  },
  {
    id: "slope",
    name: "Slope",
    category: "slope",
    icon: "◿",
    engineId: "Slope",
    components: { slope: {} },
    fields: { Dir: "UpRight" },
    defaultSize: { width: 32, height: 32 },
    editor: { placement: "rectangle", resizable: true, color: COLORS.slope },
    properties: [
      {
        key: "Dir",
        label: "Direction",
        type: "enum",
        options: ["UpRight", "UpLeft"],
        default: "UpRight",
        help: "Ramp direction. Terrain baking is done by @mmx/ldtk-tools, not the editor.",
      },
    ],
  },
  {
    id: "camera-zone",
    name: "Camera Zone",
    category: "camera",
    icon: "▢",
    engineId: "CameraZone",
    components: { camera: { zone: true } },
    fields: { BindX: true, BindY: true },
    defaultSize: { width: 398, height: 224 },
    editor: { placement: "rectangle", resizable: true, color: COLORS.camera },
    properties: [
      {
        key: "BindX",
        label: "Bind X",
        type: "boolean",
        default: true,
        help: "Lock the view horizontally to this zone.",
      },
      {
        key: "BindY",
        label: "Bind Y",
        type: "boolean",
        default: true,
        help: "Lock the view vertically to this zone.",
      },
    ],
  },
];

const BY_ID = new Map(OBJECT_DEFINITIONS.map((d) => [d.id, d]));

/** Look up a definition by id, or undefined for an unknown one. */
export function getDefinition(id: string): GameObjectDefinition | undefined {
  return BY_ID.get(id);
}

/** Look up a definition, throwing when the id is unknown (adapter/render paths). */
export function requireDefinition(id: string): GameObjectDefinition {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`content-schema: unknown definition id '${id}'`);
  return def;
}

/** Palette categories in display order. */
export const CATEGORY_ORDER: readonly string[] = [
  "spawn",
  "enemy",
  "pickup",
  "platform",
  "conveyor",
  "hazard",
  "slope",
  "camera",
];

export const CATEGORY_LABELS: Record<string, string> = {
  spawn: "Spawns",
  enemy: "Enemies",
  pickup: "Pickups",
  platform: "Platforms",
  conveyor: "Conveyors",
  hazard: "Hazards",
  slope: "Slopes",
  camera: "Camera Zones",
};

/** Effective box size of an instance: its own size, else the definition default. */
export function instanceSize(inst: LevelObjectInstance): { width: number; height: number } {
  const def = requireDefinition(inst.definitionId);
  return {
    width: inst.width ?? def.defaultSize.width,
    height: inst.height ?? def.defaultSize.height,
  };
}

/** Effective value of a property key on an instance (override, else definition default). */
export function effectiveValue(inst: LevelObjectInstance, key: string): unknown {
  const override = inst.overrides?.[key];
  if (override !== undefined) return override;
  const def = requireDefinition(inst.definitionId);
  const prop = def.properties.find((p) => p.key === key);
  if (prop && prop.default !== undefined) return prop.default;
  return def.fields[key];
}
