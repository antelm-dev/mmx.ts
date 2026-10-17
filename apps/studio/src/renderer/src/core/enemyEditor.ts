import type { PropertyMeta } from "@mmx/content-schema";
import { ENEMY_BEHAVIOR_SCHEMAS, type FieldSpec, type FieldType } from "@mmx/engine/behaviors";
import {
  GAME_DATA,
  type ActorDefinition,
  type AIEvent,
  type EnemyDefinition,
  type GameData,
  type GameDataOverlay,
  type MovementModel,
} from "@mmx/engine/data";
import { addEnemy, uniqueEnemySlug } from "./gameData.js";

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
 * Config fields naming a clip (or `clip#segment`), with the choices they add: Stun's ""
 * keeps the current clip (`animation`) or recovers on the stun clip (`recoverAnimation`).
 */
const CLIP_FIELDS: Readonly<Record<string, readonly string[]>> = {
  weakAnimation: [],
  animation: [""],
  recoverAnimation: [""],
};

/**
 * `ability`'s config fields as inspector properties. `projectile` picks one of
 * `projectiles`, a clip field (Death's `weakAnimation`, Stun's `animation` and
 * `recoverAnimation`) one of `clips`, the animation's playable names (when there
 * are any, its current value in `config` kept), and a field with `options` one of
 * those; `conflicts` (string[]) is edited apart, over the enemy's abilities.
 */
export function abilityFields(
  ability: string,
  projectiles: readonly string[],
  clips: readonly string[] = [],
  config: Readonly<Record<string, unknown>> = {},
): PropertyMeta[] {
  return Object.entries(SCHEMAS[ability] ?? {}).flatMap(([key, field]): PropertyMeta[] => {
    const { type, min, max, options } = fieldSpec(field);
    const label = fieldLabel(key);
    if (key === "projectile") return [{ key, label, type: "enum", options: projectiles }];
    const extra = CLIP_FIELDS[key];
    if (extra && clips.length > 0) {
      const options = [...extra, ...clips];
      const current = config[key];
      const keep = typeof current === "string" && current !== "" && !options.includes(current);
      return [{ key, label, type: "enum", options: keep ? [current, ...options] : options }];
    }
    if (options) return [{ key, label, type: "enum", options }];
    if (type === "number" || type === "boolean" || type === "string")
      return [{ key, label, type, min, max }];
    return [];
  });
}

/** A complete config for `ability`: the schema's defaults, else minimums; conflicts kept to `owned`. */
export function defaultAbilityConfig(ability: string, owned: readonly string[]): AbilityConfig {
  const config: AbilityConfig = Object.fromEntries(
    Object.entries(SCHEMAS[ability] ?? {}).flatMap(([key, field]): [string, ConfigValue][] => {
      const { type, min, optional, default: preset } = fieldSpec(field);
      if (preset !== undefined) return [[key, typeof preset === "object" ? [...preset] : preset]];
      // An optional field left unset keeps the ability's behaviour without it (Death's weak phase).
      if (optional) return [];
      const value: ConfigValue =
        type === "number" ? (min ?? 0) : type === "boolean" ? false : type === "string[]" ? [] : "";
      return [[key, value]];
    }),
  );
  if (Array.isArray(config.conflicts))
    config.conflicts = config.conflicts.filter((name) => owned.includes(name));
  return config;
}

/**
 * `config` shooting a projectile of `projectiles` (the project's): Shoot's default
 * (`pantheon_shot`) may be one the project lacks, which shoots the first instead.
 */
function shootingOwn(config: AbilityConfig, projectiles: readonly string[]): AbilityConfig {
  const projectile = config.projectile;
  return typeof projectile === "string" &&
    projectiles.length > 0 &&
    !projectiles.includes(projectile)
    ? { ...config, projectile: projectiles[0]! }
    : config;
}

/**
 * `enemy` owning exactly `abilities`, in that order: a new ability gets a complete
 * default config (its projectile one of `projectiles`, the project's, when given),
 * and a removed one takes its config, reactions, conflicts and hooks with it, so
 * the enemy keeps compiling.
 */
export function withAbilities(
  enemy: EnemyDefinition,
  abilities: string[],
  projectiles: readonly string[] = [],
): EnemyDefinition {
  const keep = (names: readonly string[]): string[] =>
    names.filter((name) => abilities.includes(name));
  const added = abilities.filter((name) => !enemy.abilities.includes(name));
  const abilityConfig = Object.fromEntries(
    abilities.map((ability) => {
      const config =
        enemy.abilityConfig?.[ability] ??
        shootingOwn(defaultAbilityConfig(ability, abilities), projectiles);
      if (!Array.isArray(config.conflicts)) return [ability, config];
      // An ability just added joins the conflicts the default config lists (a new Stun
      // interrupts Roll); one the user dropped while it was owned stays dropped.
      const fresh = defaultAbilityConfig(ability, added).conflicts;
      const conflicts = [...new Set([...config.conflicts, ...(Array.isArray(fresh) ? fresh : [])])];
      return [ability, { ...config, conflicts: keep(conflicts) }];
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

/** Seconds a weak phase lasts when nothing says otherwise. */
export const WEAK_DURATION = 1;

/** `enemy` with one config field of `ability` set; turning Death's weak phase on gives it a duration. */
export function withConfig(
  enemy: EnemyDefinition,
  ability: string,
  key: string,
  value: ConfigValue,
): EnemyDefinition {
  const config = { ...enemy.abilityConfig?.[ability], [key]: value };
  // Without a duration the weak phase lasts a single frame.
  if (ability === "Death" && key === "weakHealth" && Number(value) > 0)
    config.weakDuration ??= WEAK_DURATION;
  return { ...enemy, abilityConfig: { ...enemy.abilityConfig, [ability]: config } };
}

/**
 * Why Death's weak phase in `death` cannot be made for an enemy with `health`, or null
 * when it can (or is off): it starts between 1 and below `health`, and lasts 0 s or more.
 */
export function weakPhaseProblem(
  death: Readonly<Record<string, unknown>>,
  health: number,
): string | null {
  if (death.weakHealth === undefined) return null;
  if (health <= 1) return "Needs more than 1 health.";
  const at = Number(death.weakHealth);
  if (!(at >= 1 && at < health)) return `At health must be between 1 and ${health - 1}.`;
  if (!(Number(death.weakDuration ?? 0) >= 0)) return "Seconds must be 0 or more.";
  return null;
}

/**
 * `enemy` whose Death falls over before exploding (at 1 health, playing `clip`, for
 * {@link WEAK_DURATION}), or, with no `clip`, explodes at once.
 */
export function withWeakPhase(enemy: EnemyDefinition, clip: string | undefined): EnemyDefinition {
  const {
    weakHealth: _h,
    weakAnimation: _a,
    weakDuration: _d,
    ...death
  } = enemy.abilityConfig?.Death ?? {};
  const off = { ...enemy, abilityConfig: { ...enemy.abilityConfig, Death: death } };
  if (clip === undefined) return off;
  return withConfig(withConfig(off, "Death", "weakAnimation", clip), "Death", "weakHealth", 1);
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
  // The engine has no enemies of its own: an enemy is always the project's.
  const enemy = overlay?.enemies?.[ref];
  if (!isObject(enemy)) return null;
  const actor = overlay?.actors?.[String(enemy.actor)] ?? GAME_DATA.actors[String(enemy.actor)];
  if (!editableShape(enemy, actor)) return null;
  return { enemy, actor, editable: true };
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

/** The movement models an enemy body can use (the engine's `MovementModel`). */
export const MOVEMENTS: readonly MovementModel[] = ["ground", "flying"];

/**
 * The record a blank enemy starts from: no ability, 8×8 half-extent boxes (the smallest
 * built-in half width) and the Pantheon Hunter's plain sight box.
 */
export const BLANK_ENEMY: EnemyDefinition = {
  id: "",
  sheet: "",
  actor: "",
  hurtbox: { hw: 8, hh: 8 },
  // The built-ins' median (1, 2, 3).
  touchDamage: 2,
  movement: "ground",
  perception: { hw: 140, hh: 48, oy: 0 },
  abilities: [],
  abilityConfig: {},
  reactions: {},
  initialAnimation: "idle",
};

/**
 * The abilities that may answer each AI event, as the built-in enemies wire them (idle:
 * Patrol or Hover, …), plus Roll on idle as Patrol (C-ROLL).
 */
const DEFAULT_ANSWERS: Partial<Record<AIEvent, readonly string[]>> = {
  idle: ["Roll", "Patrol", "Hover"],
  see_player: ["Hide", "Pursuit", "Shoot"],
  touch_player: ["Recoil"],
  guard_break: ["Stun"],
  get_hit: ["Stun"],
};

/** Reactions for an enemy owning `abilities`: each event to the first of them that may answer it. */
export function defaultReactions(abilities: readonly string[]): EnemyDefinition["reactions"] {
  const reactions: EnemyDefinition["reactions"] = {};
  for (const [event, answers] of Object.entries(DEFAULT_ANSWERS) as [AIEvent, string[]][]) {
    const first = abilities.find((ability) => answers.includes(ability));
    if (first) reactions[event] = [first];
  }
  return reactions;
}

/**
 * The movement an ability needs. Patrol, Hide, Shoot and Roll apply gravity, which drops a
 * flier through the floor (fliers skip terrain); Hover, Pursuit and Recoil steer in
 * the air with none. Stun's gravity is a setting, and Death is either.
 * shortcut: mirrors game/enemy's process_gravity calls; update it with those files.
 */
const ABILITY_MOVEMENT: Readonly<Record<string, MovementModel>> = {
  Patrol: "ground",
  Hide: "ground",
  Shoot: "ground",
  Roll: "ground",
  Hover: "flying",
  Pursuit: "flying",
  Recoil: "flying",
};

/** The abilities an enemy moving as `movement` can use, in registry order. */
export function abilitiesFor(movement: MovementModel): string[] {
  return ENEMY_ABILITIES.filter((ability) => (ABILITY_MOVEMENT[ability] ?? movement) === movement);
}

/** `enemy` moving as `movement`: abilities it can no longer use dropped, Stun falling on the ground only. */
export function withMovement(enemy: EnemyDefinition, movement: MovementModel): EnemyDefinition {
  const usable = abilitiesFor(movement);
  const next = withAbilities(
    { ...enemy, movement },
    enemy.abilities.filter((ability) => usable.includes(ability)),
  );
  return next.abilities.includes("Stun")
    ? withConfig(next, "Stun", "gravity", movement === "ground")
    : next;
}

export type BlankEnemyInput = {
  name: string;
  health: number;
  /** Sheet, first clip, touch damage, movement and abilities (in order, with any configs set). */
  enemy: Pick<
    EnemyDefinition,
    "sheet" | "initialAnimation" | "touchDamage" | "movement" | "abilities" | "abilityConfig"
  >;
};

/**
 * Add an enemy composed from abilities to the overlay: actor `enemy.<slug>`, enemy
 * `<slug>` and prefab `enemy.<slug>`, with {@link BLANK_ENEMY}'s boxes, a complete
 * config per ability its movement allows, and {@link defaultReactions}. Returns the
 * next overlay and the prefab id.
 */
export function addBlankEnemy(
  overlay: GameDataOverlay | undefined,
  data: GameData,
  input: BlankEnemyInput,
): { overlay: GameDataOverlay; id: string } {
  const slug = uniqueEnemySlug(data, input.name);
  const id = `enemy.${slug}`;
  const name = input.name.trim();
  const moving = withMovement(
    { ...BLANK_ENEMY, ...input.enemy, id: slug, actor: id },
    input.enemy.movement,
  );
  const wired = { ...moving, reactions: defaultReactions(moving.abilities) };
  // A Shoot config given with the input may still name a projectile the project lacks.
  const shoot = wired.abilityConfig?.Shoot;
  const enemy = shoot
    ? {
        ...wired,
        abilityConfig: {
          ...wired.abilityConfig,
          Shoot: shootingOwn(shoot, Object.keys(data.projectiles)),
        },
      }
    : wired;
  const next: GameDataOverlay = {
    schemaVersion: GAME_DATA.schemaVersion,
    ...overlay,
    actors: {
      ...overlay?.actors,
      [id]: { id, body: { hw: 8, hh: 8 }, maxHealth: input.health },
    },
    enemies: { ...overlay?.enemies, [slug]: enemy },
    prefabs: {
      ...overlay?.prefabs,
      [id]: {
        id,
        ...(name ? { name } : {}),
        runtime: "enemy",
        source: { kind: "enemy", ref: slug },
        // As every built-in enemy prefab.
        fields: [{ name: "FacesRight", type: "boolean", default: false }],
      },
    },
  };
  return { overlay: next, id };
}

/**
 * Whether `prefabId` places an enemy the project adds (neither a built-in nor an
 * override of one), which can be renamed and deleted.
 */
export function isProjectEnemy(overlay: GameDataOverlay | undefined, prefabId: string): boolean {
  const source = overlay?.prefabs?.[prefabId]?.source;
  return (
    source?.kind === "enemy" && !!overlay?.enemies?.[source.ref] && !(prefabId in GAME_DATA.prefabs)
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
