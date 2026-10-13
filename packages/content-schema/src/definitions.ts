import {
  GAME_DATA,
  type GameData,
  type PrefabDefinition,
  type PrefabField,
} from "@mmx/engine/data";
import type { GameObjectDefinition, LevelObjectInstance, PropertyMeta } from "./types.js";

/**
 * The catalog of every authorable object, one definition per palette entry,
 * generated from the engine's level-facing prefabs (`GameData.prefabs`): the
 * prefab id is the definition id and its typed fields are the properties.
 * Only presentation (names, icons, colours, help) lives here.
 *
 * Kind is folded into the definition identity rather than left as an editable
 * field: a Metool and a Bat are two palette entries (`enemy.metool` /
 * `enemy.bat`), so "change this enemy's kind" is "swap its definition", which is
 * exactly what the engine's `loadLevel` validates the `Kind` field against. The
 * remaining `properties` are the per-instance overrides the inspector edits.
 *
 * `engineId` is the engine entity id the adapter emits, so these stay in lockstep
 * with what `packages/engine/src/game/level.ts` reads.
 */

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
  "unknown",
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
  unknown: "Missing Objects",
};

type Size = { width: number; height: number };
const SMALL: Size = { width: 16, height: 16 };

/**
 * How each engine spawner appears in the editor, keyed by prefab runtime, or by
 * the referenced pickup/environment behaviour for those generic runtimes. A
 * prefab whose spawner is not listed has no level entity and is left out.
 */
const ENGINE_KINDS: Record<
  string,
  {
    category: string;
    engineId: string;
    icon: string;
    color: string;
    placement: "point" | "rectangle";
    defaultSize: Size;
    /** `sheet`: an enemy's sprite sheet key, which renderers look its clips up by. */
    components: (kind: string, sheet?: string) => Record<string, unknown>;
  }
> = {
  "spawn.player": {
    category: "spawn",
    engineId: "Spawn",
    icon: "◎",
    color: "#38bdf8",
    placement: "point",
    defaultSize: SMALL,
    components: () => ({ player: {} }),
  },
  enemy: {
    category: "enemy",
    engineId: "Enemy",
    icon: "▲",
    color: "#f97316",
    placement: "point",
    defaultSize: SMALL,
    components: (kind, sheet) => ({ enemy: { kind, sheet } }),
  },
  "pickup.life": {
    category: "pickup",
    engineId: "LifeCapsule",
    icon: "＋",
    color: "#22c55e",
    placement: "point",
    defaultSize: SMALL,
    components: (size) => ({ pickup: { kind: "life", size } }),
  },
  "pickup.weapon-energy": {
    category: "pickup",
    engineId: "WeaponCapsule",
    icon: "◇",
    color: "#22c55e",
    placement: "point",
    defaultSize: SMALL,
    components: (size) => ({ pickup: { kind: "weapon", size } }),
  },
  "environment.moving-platform": {
    category: "platform",
    engineId: "MovingPlatform",
    icon: "▭",
    color: "#eab308",
    placement: "rectangle",
    defaultSize: { width: 48, height: 8 },
    components: () => ({ platform: { moving: true } }),
  },
  "environment.conveyor": {
    category: "conveyor",
    engineId: "Conveyor",
    icon: "⇥",
    color: "#14b8a6",
    placement: "rectangle",
    defaultSize: { width: 64, height: 8 },
    components: () => ({ conveyor: {} }),
  },
  "environment.hazard": {
    category: "hazard",
    engineId: "Hazard",
    icon: "☠",
    color: "#ef4444",
    placement: "rectangle",
    defaultSize: SMALL,
    components: () => ({ hazard: { lethal: true } }),
  },
  camera: {
    category: "camera",
    engineId: "CameraZone",
    icon: "▢",
    color: "#6366f1",
    placement: "rectangle",
    defaultSize: { width: 398, height: 224 },
    components: () => ({ camera: { zone: true } }),
  },
};

/** Per-prefab presentation over the {@link ENGINE_KINDS} fallbacks; property help by field name. */
const PRESENTATION: Record<
  string,
  { name: string; icon?: string; defaultSize?: Size; help?: Record<string, string> }
> = {
  spawn: { name: "Spawn" },
  "enemy.metool": {
    name: "Metool",
    defaultSize: SMALL,
    help: { FacesRight: "Initial spawn facing (unchecked faces left)." },
  },
  "enemy.bat": { name: "Bat", icon: "ᗢ", defaultSize: SMALL },
  "enemy.pantheon": { name: "Pantheon Hunter", icon: "◆", defaultSize: { width: 16, height: 32 } },
  "pickup.life.small": { name: "Life Capsule (Small)" },
  "pickup.life.large": { name: "Life Capsule (Large)", icon: "✚" },
  "pickup.weapon.small": { name: "Weapon Capsule (Small)" },
  "pickup.weapon.large": { name: "Weapon Capsule (Large)", icon: "◆" },
  "platform.moving": {
    name: "Moving Platform",
    help: {
      Travel: "Horizontal travel distance in pixels.",
      Speed: "Travel speed in pixels/second.",
    },
  },
  conveyor: {
    name: "Conveyor",
    help: { Speed: "Belt speed in pixels/second; negative pushes left." },
  },
  hazard: { name: "Hazard" },
  "camera-zone": {
    name: "Camera Zone",
    help: {
      BindX: "Lock the view horizontally to this zone.",
      BindY: "Lock the view vertically to this zone.",
    },
  },
};

/** Slopes are baked into terrain, not spawned, so they have no engine prefab. */
const SLOPE: GameObjectDefinition = {
  id: "slope",
  name: "Slope",
  category: "slope",
  icon: "◿",
  engineId: "Slope",
  components: { slope: {} },
  fields: {},
  defaultSize: { width: 32, height: 32 },
  editor: { placement: "rectangle", resizable: true, color: "#a855f7" },
  properties: [
    {
      key: "Dir",
      label: "Direction",
      type: "enum",
      options: ["UpRight", "UpLeft"],
      default: "UpRight",
      help: "Ramp direction. Terrain baking happens when converting to engine LevelData.",
    },
  ],
};

function engineKindOf(data: GameData, prefab: PrefabDefinition): string | undefined {
  const { runtime, source } = prefab;
  if (runtime === "pickup" && source.kind === "pickup") return data.pickups[source.ref]?.behavior;
  if (runtime === "environment" && source.kind === "environment")
    return data.environments[source.ref]?.behavior;
  return runtime;
}

function propertyOf(field: PrefabField, help: string | undefined): PropertyMeta {
  return {
    key: field.name,
    label: field.name.replace(/([a-z])([A-Z])/g, "$1 $2"),
    type: field.type,
    default: field.default,
    ...(field.enum ? { options: field.enum } : {}),
    // A 0 minimum is the inspector's "≥ 0" check.
    ...(field.min === 0
      ? { nonNegative: true }
      : field.min !== undefined
        ? { min: field.min }
        : {}),
    ...(field.max !== undefined ? { max: field.max } : {}),
    ...(help ? { help } : {}),
  };
}

function definitionOf(data: GameData, prefab: PrefabDefinition): GameObjectDefinition | undefined {
  const kind = ENGINE_KINDS[engineKindOf(data, prefab) ?? ""];
  if (!kind) return undefined;
  const { source } = prefab;
  const ref = "ref" in source ? source.ref : "";
  // shortcut: a pickup's level Kind is its size, the last segment of its id
  // ("life.small" → "small"); give PickupDefinition a size if that ever diverges.
  const entityKind = source.kind === "pickup" ? ref.slice(ref.lastIndexOf(".") + 1) : ref;
  const enemy = source.kind === "enemy" ? data.enemies[ref] : undefined;
  const hurtbox = enemy?.hurtbox;
  const look = PRESENTATION[prefab.id];
  const lastSegment = prefab.id.slice(prefab.id.lastIndexOf(".") + 1);
  return {
    id: prefab.id,
    name: look?.name ?? prefab.name ?? lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1),
    category: kind.category,
    icon: look?.icon ?? kind.icon,
    engineId: kind.engineId,
    components: kind.components(entityKind, enemy?.sheet),
    fields: kind.category === "enemy" || kind.category === "pickup" ? { Kind: entityKind } : {},
    defaultSize:
      look?.defaultSize ??
      (hurtbox ? { width: 2 * hurtbox.hw, height: 2 * hurtbox.hh } : kind.defaultSize),
    editor:
      kind.placement === "point"
        ? { placement: "point", color: kind.color }
        : { placement: "rectangle", resizable: true, color: kind.color },
    properties: prefab.fields.map((field) => propertyOf(field, look?.help?.[field.name])),
  };
}

/** The built-in catalog for `data`: one definition per placeable prefab plus `slope`, in palette order. */
export function definitionsFromGameData(data: GameData): GameObjectDefinition[] {
  const defs = Object.values(data.prefabs).flatMap((prefab) => definitionOf(data, prefab) ?? []);
  defs.push(SLOPE);
  const rank = (def: GameObjectDefinition) => CATEGORY_ORDER.indexOf(def.category);
  return defs.sort((a, b) => rank(a) - rank(b));
}

/** The catalog generated from the engine's default game data. */
export const OBJECT_DEFINITIONS: readonly GameObjectDefinition[] =
  definitionsFromGameData(GAME_DATA);

let builtins = OBJECT_DEFINITIONS;
let builtinIds = new Set(builtins.map((d) => d.id));
let projectDefinitions: readonly GameObjectDefinition[] = [];
let byId = new Map(builtins.map((d) => [d.id, d]));

/** True for an id of the built-in catalog (never a project definition). */
export function isBuiltinDefinition(id: string): boolean {
  return builtinIds.has(id);
}

/** Built-in definitions followed by the open project's, in palette order. */
export function allDefinitions(): readonly GameObjectDefinition[] {
  return projectDefinitions.length ? [...builtins, ...projectDefinitions] : builtins;
}

/**
 * Replaces the built-in part of the catalog (generated from a project's merged
 * game data). Call `setCatalogGameData`, which also re-derives the project part.
 */
export function replaceBuiltinDefinitions(defs: readonly GameObjectDefinition[]): void {
  builtins = defs;
  builtinIds = new Set(defs.map((d) => d.id));
  byId = new Map([...defs, ...projectDefinitions].map((d) => [d.id, d]));
}

/**
 * Replaces the project part of the catalog that every lookup below reads.
 * Call `setProjectDefinitions`, which validates and derives them first.
 *
 * shortcut: one catalog per process (Studio opens one project, build-tools
 * compiles one at a time); thread a catalog through the lookups if two
 * projects ever need to be resolved side by side.
 */
export function replaceProjectDefinitions(defs: readonly GameObjectDefinition[]): void {
  projectDefinitions = defs;
  byId = new Map([...builtins, ...defs].map((d) => [d.id, d]));
}

/** Look up a definition by id, or undefined for an unknown one. */
export function getDefinition(id: string): GameObjectDefinition | undefined {
  return byId.get(id);
}

/** Look up a definition, throwing when the id is unknown (adapter/render paths). */
export function requireDefinition(id: string): GameObjectDefinition {
  const def = byId.get(id);
  if (!def) throw new Error(`content-schema: unknown definition id '${id}'`);
  return def;
}

/**
 * The definition of an instance for display and editing: its definition, or a
 * placeholder when the id is unknown (a project object that was removed, a
 * level from another project). Validation reports `definition.unknown`, so the
 * placeholder never reaches the engine; it only keeps editor reads from throwing.
 */
export function definitionFor(id: string): GameObjectDefinition {
  return (
    byId.get(id) ?? {
      id,
      name: `Missing object (${id})`,
      category: "unknown",
      icon: "?",
      engineId: id,
      components: {},
      fields: {},
      defaultSize: { width: 16, height: 16 },
      editor: { placement: "point", color: "#9ca3af" },
      properties: [],
    }
  );
}

/** Effective box size of an instance: its own size, else the definition default. */
export function instanceSize(inst: LevelObjectInstance): { width: number; height: number } {
  const def = definitionFor(inst.definitionId);
  return {
    width: inst.width ?? def.defaultSize.width,
    height: inst.height ?? def.defaultSize.height,
  };
}

/** Effective value of a property key on an instance (override, else definition default). */
export function effectiveValue(inst: LevelObjectInstance, key: string): unknown {
  const override = inst.overrides?.[key];
  if (override !== undefined) return override;
  const def = definitionFor(inst.definitionId);
  const prop = def.properties.find((p) => p.key === key);
  if (prop && prop.default !== undefined) return prop.default;
  return def.fields[key];
}

/**
 * The engine `fields` an instance compiles to: the definition's fixed fields plus
 * every declared property, resolved. Overrides for undeclared keys are dropped
 * (validation warns about them), so every compiler emits the same entity.
 */
export function entityFields(inst: LevelObjectInstance): Record<string, unknown> {
  const def = requireDefinition(inst.definitionId);
  const fields: Record<string, unknown> = { ...def.fields };
  for (const prop of def.properties) fields[prop.key] = effectiveValue(inst, prop.key);
  return fields;
}
