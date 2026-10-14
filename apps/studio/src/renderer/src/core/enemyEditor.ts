import type { PropertyMeta } from "@mmx/content-schema";
import { ENEMY_BEHAVIOR_SCHEMAS, type FieldSpec, type FieldType } from "@mmx/engine/behaviors";
import {
  GAME_DATA,
  type ActorDefinition,
  type AIEvent,
  type EnemyDefinition,
  type GameData,
  type GameDataOverlay,
} from "@mmx/engine/data";
import { addEnemy } from "./gameData.js";

type ConfigValue = number | string | boolean | string[];
type AbilityConfig = Record<string, ConfigValue>;

const SCHEMAS: Readonly<Record<string, Readonly<Record<string, FieldType | FieldSpec>>>> =
  ENEMY_BEHAVIOR_SCHEMAS;

/** Every enemy ability the engine registers, in registry order. */
export const ENEMY_ABILITIES = Object.keys(SCHEMAS);

// A Record so a new engine event fails to typecheck until it is listed here.
const EVENTS: Record<AIEvent, true> = {
  idle: true,
  see_player: true,
  touch_player: true,
  guard_break: true,
  get_hit: true,
  death: true,
  hit_wall: true,
};
/** The AI events an enemy reacts to. */
export const AI_EVENTS = Object.keys(EVENTS) as AIEvent[];

/**
 * Effects that drive one of the enemy's abilities, dropped with it.
 * shortcut: mirrors game/enemies' effect wiring; move to the effect registry when effects grow.
 */
const EFFECT_ABILITY: Record<string, string> = { "enemy.reanchor-hover": "Hover" };

const fieldSpec = (field: FieldType | FieldSpec): FieldSpec =>
  typeof field === "string" ? { type: field } : field;

/** "travelSpeed" → "Travel speed". */
export function fieldLabel(key: string): string {
  const words = key.replace(/([A-Z])/g, " $1").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * `ability`'s config fields as inspector properties. `projectile` picks one of
 * `projectiles`; `conflicts` (string[]) is edited apart, over the enemy's abilities.
 */
export function abilityFields(ability: string, projectiles: readonly string[]): PropertyMeta[] {
  return Object.entries(SCHEMAS[ability] ?? {}).flatMap(([key, field]): PropertyMeta[] => {
    const { type, min, max } = fieldSpec(field);
    const label = fieldLabel(key);
    if (key === "projectile") return [{ key, label, type: "enum", options: projectiles }];
    if (type === "number" || type === "boolean" || type === "string")
      return [{ key, label, type, min, max }];
    return [];
  });
}

/** A complete config for `ability`: a built-in enemy's, else the schema's minimums; conflicts kept to `owned`. */
export function defaultAbilityConfig(ability: string, owned: readonly string[]): AbilityConfig {
  const builtIn = Object.values(GAME_DATA.enemies).find((enemy) => enemy.abilityConfig?.[ability])
    ?.abilityConfig?.[ability];
  const config: AbilityConfig = builtIn
    ? { ...builtIn }
    : Object.fromEntries(
        Object.entries(SCHEMAS[ability] ?? {}).map(([key, field]) => {
          const { type, min } = fieldSpec(field);
          const value: ConfigValue =
            type === "number"
              ? (min ?? 0)
              : type === "boolean"
                ? false
                : type === "string[]"
                  ? []
                  : "";
          return [key, value];
        }),
      );
  if (Array.isArray(config.conflicts))
    config.conflicts = config.conflicts.filter((name) => owned.includes(name));
  return config;
}

/**
 * `enemy` owning exactly `abilities`, in that order: a new ability gets a complete
 * default config, and a removed one takes its config, reactions, conflicts and
 * hooks with it, so the enemy keeps compiling.
 */
export function withAbilities(enemy: EnemyDefinition, abilities: string[]): EnemyDefinition {
  const keep = (names: readonly string[]): string[] =>
    names.filter((name) => abilities.includes(name));
  const abilityConfig = Object.fromEntries(
    abilities.map((ability) => {
      const config = enemy.abilityConfig?.[ability] ?? defaultAbilityConfig(ability, abilities);
      return [
        ability,
        Array.isArray(config.conflicts) ? { ...config, conflicts: keep(config.conflicts) } : config,
      ];
    }),
  );
  const reactions: EnemyDefinition["reactions"] = {};
  for (const event of AI_EVENTS) {
    const names = keep(enemy.reactions[event] ?? []);
    if (names.length > 0) reactions[event] = names;
  }
  const next: EnemyDefinition = { ...enemy, abilities, abilityConfig, reactions };
  if (enemy.hooks) {
    next.hooks = enemy.hooks.filter(
      (hook) =>
        (!hook.ability || abilities.includes(hook.ability)) &&
        (!EFFECT_ABILITY[hook.effect] || abilities.includes(EFFECT_ABILITY[hook.effect]!)),
    );
  }
  return next;
}

/** `list` with `item` appended (on) or removed (off); order otherwise kept. */
export function toggled(list: readonly string[], item: string, on: boolean): string[] {
  const rest = list.filter((entry) => entry !== item);
  return on ? [...rest, item] : rest;
}

/** `enemy` with `ability` answering `event` or not; an event left with none is dropped. */
export function withReaction(
  enemy: EnemyDefinition,
  event: AIEvent,
  ability: string,
  on: boolean,
): EnemyDefinition {
  const reactions = {
    ...enemy.reactions,
    [event]: toggled(enemy.reactions[event] ?? [], ability, on),
  };
  if (reactions[event]!.length === 0) delete reactions[event];
  return { ...enemy, reactions };
}

/** `enemy` with one config field of `ability` set. */
export function withConfig(
  enemy: EnemyDefinition,
  ability: string,
  key: string,
  value: ConfigValue,
): EnemyDefinition {
  const config = { ...enemy.abilityConfig?.[ability], [key]: value };
  return { ...enemy, abilityConfig: { ...enemy.abilityConfig, [ability]: config } };
}

/** The overlay with `enemy` (and `actor`, when given) replaced. */
export function putEnemy(
  overlay: GameDataOverlay,
  enemy: EnemyDefinition,
  actor?: ActorDefinition,
): GameDataOverlay {
  return {
    ...overlay,
    enemies: { ...overlay.enemies, [enemy.id]: enemy },
    ...(actor ? { actors: { ...overlay.actors, [actor.id]: actor } } : {}),
  };
}

export type EditedEnemy = {
  enemy: EnemyDefinition;
  actor: ActorDefinition | undefined;
  editable: boolean;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNames = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((name) => typeof name === "string");

/**
 * Whether a (hand-editable, so untrusted) data/game.json enemy and its actor have
 * the shape the Enemy panel reads; values themselves are left to compilation.
 */
function editableShape(enemy: unknown, actor: unknown): boolean {
  if (
    !isObject(enemy) ||
    !isNames(enemy.abilities) ||
    !isObject(enemy.hurtbox) ||
    !isObject(enemy.perception)
  ) {
    return false;
  }
  if (
    !isObject(enemy.reactions) ||
    !Object.values(enemy.reactions).every((names) => names === undefined || isNames(names))
  ) {
    return false;
  }
  if (
    enemy.abilityConfig !== undefined &&
    !(isObject(enemy.abilityConfig) && Object.values(enemy.abilityConfig).every(isObject))
  ) {
    return false;
  }
  if (enemy.hooks !== undefined && !(Array.isArray(enemy.hooks) && enemy.hooks.every(isObject)))
    return false;
  return actor === undefined || (isObject(actor) && isObject(actor.body));
}

/**
 * The enemy a palette definition (prefab id) places; editable when the project's
 * overlay defines it. Null for a non-enemy, or a record too malformed to show.
 */
export function enemyForPrefab(
  overlay: GameDataOverlay | undefined,
  prefabId: string,
): EditedEnemy | null {
  const prefab: unknown = overlay?.prefabs?.[prefabId] ?? GAME_DATA.prefabs[prefabId];
  if (!isObject(prefab) || !isObject(prefab.source) || prefab.source.kind !== "enemy") return null;
  const ref = String(prefab.source.ref);
  const own = overlay?.enemies?.[ref];
  const enemy = own ?? GAME_DATA.enemies[ref];
  if (!isObject(enemy)) return null;
  const actor = overlay?.actors?.[String(enemy.actor)] ?? GAME_DATA.actors[String(enemy.actor)];
  if (!editableShape(enemy, actor)) return null;
  return { enemy, actor, editable: !!own };
}

/**
 * Copy enemy `enemyId` (actor, enemy, prefab) into the overlay as "`name` copy"
 * (id `enemy.<name>-copy`, or the next free one); returns the new prefab id.
 */
export function duplicateEnemy(
  overlay: GameDataOverlay | undefined,
  data: GameData,
  enemyId: string,
  name: string,
): { overlay: GameDataOverlay; id: string } {
  const enemy = data.enemies[enemyId];
  const actor = enemy && data.actors[enemy.actor];
  if (!enemy || !actor) throw new Error(`Unknown enemy '${enemyId}'.`);
  return addEnemy(overlay, data, {
    name: `${name} copy`,
    base: enemyId,
    sheet: enemy.sheet,
    health: actor.maxHealth,
    touchDamage: enemy.touchDamage,
  });
}

/**
 * Whether `prefabId` places an enemy the project adds (neither a built-in nor an
 * override of one), which can be renamed and deleted.
 */
export function isProjectEnemy(overlay: GameDataOverlay | undefined, prefabId: string): boolean {
  const source = overlay?.prefabs?.[prefabId]?.source;
  return (
    source?.kind === "enemy" &&
    !!overlay?.enemies?.[source.ref] &&
    !(prefabId in GAME_DATA.prefabs) &&
    !(source.ref in GAME_DATA.enemies)
  );
}

/** The overlay with project enemy `prefabId` displayed as `name`; its ids and records are unchanged. */
export function renameEnemy(
  overlay: GameDataOverlay,
  prefabId: string,
  name: string,
): GameDataOverlay {
  const prefab = overlay.prefabs?.[prefabId];
  if (!prefab || !isProjectEnemy(overlay, prefabId))
    throw new Error(`'${prefabId}' is not a project enemy.`);
  return { ...overlay, prefabs: { ...overlay.prefabs, [prefabId]: { ...prefab, name } } };
}

/**
 * The overlay without project enemy `prefabId`: its prefab, its enemy, and its
 * actor unless a built-in or another project enemy still uses that actor.
 */
export function deleteEnemy(overlay: GameDataOverlay, prefabId: string): GameDataOverlay {
  const prefab = overlay.prefabs?.[prefabId];
  // A record overriding a built-in is never deleted: that would silently revert the built-in.
  if (!prefab || prefab.source.kind !== "enemy" || !isProjectEnemy(overlay, prefabId)) {
    throw new Error(`'${prefabId}' is not a project enemy.`);
  }
  // shortcut: assumes one prefab per enemy (as Studio writes them); a hand-written second one fails to compile.
  const ref = prefab.source.ref;
  const { [prefabId]: _prefab, ...prefabs } = overlay.prefabs ?? {};
  const { [ref]: enemy, ...enemies } = overlay.enemies ?? {};
  const actorId = enemy?.actor ?? "";
  const shared =
    actorId in GAME_DATA.actors || Object.values(enemies).some((other) => other.actor === actorId);
  const { [actorId]: _actor, ...actors } = overlay.actors ?? {};
  return { ...overlay, prefabs, enemies, actors: shared ? overlay.actors : actors };
}
