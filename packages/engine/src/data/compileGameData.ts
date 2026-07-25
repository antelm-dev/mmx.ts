import type {
  AbilityDefinition,
  CompileGameDataResult,
  CompileRegistries,
  CompiledAbility,
  CompiledEnemy,
  CompiledGameData,
  CompiledLoadout,
  CompiledWeapon,
  EnemyDefinition,
  GameData,
  GameDataDiagnostic,
  Hitbox,
  LoadoutDefinition,
  PrefabDefinition,
  WeaponDefinition,
} from "./types.js";
import { hashGameData } from "./hash.js";

/**
 * Compile raw {@link GameData} into a validated, reference-resolved
 * {@link CompiledGameData}.
 *
 * One pass, all-or-nothing: every problem is collected and returned together,
 * and a compiled value is produced only when no error-severity diagnostic was
 * raised. Callers never observe partial compiled data.
 *
 * Behaviour ids are checked against `registries` (a set of known ids per surface,
 * with optional per-id config validators). Passing a real registry set fails
 * compilation for unknown behaviours; a test may pass a permissive stub.
 */
export function compileGameData(
  data: GameData,
  registries: CompileRegistries,
): CompileGameDataResult {
  const diagnostics: GameDataDiagnostic[] = [];
  const error = (d: Omit<GameDataDiagnostic, "severity">): void => {
    diagnostics.push({ severity: "error", ...d });
  };
  const warn = (d: Omit<GameDataDiagnostic, "severity">): void => {
    diagnostics.push({ severity: "warning", ...d });
  };

  // --- key/id agreement (the record key IS the identity; a mismatched `id`
  //     field is a copy-paste bug that would desync every reference) ----------
  const checkKeyId = <T extends { id: string }>(
    table: Record<string, T>,
    category: string,
  ): void => {
    for (const [key, def] of Object.entries(table)) {
      if (def.id !== key) {
        error({
          code: "id.mismatch",
          definitionId: key,
          fieldPath: `${category}.${key}.id`,
          message: `${category} '${key}' declares id '${def.id}'.`,
        });
      }
    }
  };
  checkKeyId(data.actors, "actors");
  checkKeyId(data.abilities, "abilities");
  checkKeyId(data.loadouts, "loadouts");
  checkKeyId(data.enemies, "enemies");
  checkKeyId(data.weapons, "weapons");
  checkKeyId(data.projectiles, "projectiles");
  checkKeyId(data.pickups, "pickups");
  checkKeyId(data.environments, "environments");
  checkKeyId(data.prefabs, "prefabs");

  // --- numeric + hitbox helpers ---------------------------------------------
  const num = (v: number, path: string, id: string, opts: { min?: number; gt?: number }): void => {
    if (typeof v !== "number" || !Number.isFinite(v)) {
      error({
        code: "value.number",
        definitionId: id,
        fieldPath: path,
        message: `${path} must be a finite number.`,
      });
      return;
    }
    if (opts.gt !== undefined && !(v > opts.gt)) {
      error({
        code: "value.range",
        definitionId: id,
        fieldPath: path,
        message: `${path} must be > ${opts.gt}.`,
      });
    }
    if (opts.min !== undefined && v < opts.min) {
      error({
        code: "value.range",
        definitionId: id,
        fieldPath: path,
        message: `${path} must be ≥ ${opts.min}.`,
      });
    }
  };
  const hitbox = (box: Hitbox, path: string, id: string): void => {
    num(box.hw, `${path}.hw`, id, { gt: 0 });
    num(box.hh, `${path}.hh`, id, { gt: 0 });
    if (box.ox !== undefined) num(box.ox, `${path}.ox`, id, {});
    if (box.oy !== undefined) num(box.oy, `${path}.oy`, id, {});
  };

  // --- physics ---------------------------------------------------------------
  num(data.physics.gravity, "physics.gravity", "physics", { gt: 0 });
  num(data.physics.maxFallVelocity, "physics.maxFallVelocity", "physics", { gt: 0 });
  num(data.physics.floorSnapLength, "physics.floorSnapLength", "physics", { min: 0 });

  // --- actors ----------------------------------------------------------------
  for (const actor of Object.values(data.actors)) {
    hitbox(actor.body, `actors.${actor.id}.body`, actor.id);
    num(actor.maxHealth, `actors.${actor.id}.maxHealth`, actor.id, { gt: 0 });
  }

  // --- abilities -------------------------------------------------------------
  for (const a of Object.values(data.abilities)) {
    if (!registries.abilities.has(a.behavior)) {
      error({
        code: "behavior.unknown",
        definitionId: a.id,
        fieldPath: `abilities.${a.id}.behavior`,
        message: `Unknown ability behavior '${a.behavior}'.`,
      });
    } else {
      validateBehaviorConfig(
        registries.abilities,
        a.behavior,
        a.config,
        `abilities.${a.id}.config`,
        a.id,
        error,
      );
    }
    if (a.priority !== undefined) num(a.priority, `abilities.${a.id}.priority`, a.id, {});
  }

  // --- loadouts --------------------------------------------------------------
  for (const l of Object.values(data.loadouts)) {
    if (!data.actors[l.actor]) {
      error({
        code: "reference.missing",
        definitionId: l.id,
        fieldPath: `loadouts.${l.id}.actor`,
        message: `Loadout references unknown actor '${l.actor}'.`,
      });
    }
    for (const [i, slot] of l.slots.entries()) {
      if (!data.abilities[slot.ability]) {
        error({
          code: "reference.missing",
          definitionId: l.id,
          fieldPath: `loadouts.${l.id}.slots[${i}].ability`,
          message: `Loadout references unknown ability '${slot.ability}'.`,
        });
      }
      if (slot.priority !== undefined)
        num(slot.priority, `loadouts.${l.id}.slots[${i}].priority`, l.id, {});
    }
    for (const [i, w] of l.weapons.entries()) {
      if (!data.weapons[w]) {
        error({
          code: "reference.missing",
          definitionId: l.id,
          fieldPath: `loadouts.${l.id}.weapons[${i}]`,
          message: `Loadout references unknown weapon '${w}'.`,
        });
      }
    }
    if (!l.weapons.includes(l.initialWeapon)) {
      error({
        code: "reference.invalid",
        definitionId: l.id,
        fieldPath: `loadouts.${l.id}.initialWeapon`,
        message: `initialWeapon '${l.initialWeapon}' is not in this loadout's weapons.`,
      });
    }
  }

  // --- projectiles -----------------------------------------------------------
  for (const p of Object.values(data.projectiles)) {
    if (!registries.projectiles.has(p.behavior)) {
      error({
        code: "behavior.unknown",
        definitionId: p.id,
        fieldPath: `projectiles.${p.id}.behavior`,
        message: `Unknown projectile behavior '${p.behavior}'.`,
      });
    }
    num(p.damage, `projectiles.${p.id}.damage`, p.id, { min: 0 });
    num(p.speed, `projectiles.${p.id}.speed`, p.id, { gt: 0 });
    num(p.lifetime, `projectiles.${p.id}.lifetime`, p.id, { min: 0 });
    num(p.verticalRange, `projectiles.${p.id}.verticalRange`, p.id, { min: 0 });
    hitbox(p.hitbox, `projectiles.${p.id}.hitbox`, p.id);
    if (p.animation.frameCount !== undefined)
      num(p.animation.frameCount, `projectiles.${p.id}.animation.frameCount`, p.id, { gt: 0 });
  }

  // --- weapons ---------------------------------------------------------------
  for (const w of Object.values(data.weapons)) {
    if (w.maxAmmo !== "infinite") num(w.maxAmmo, `weapons.${w.id}.maxAmmo`, w.id, { gt: 0 });
    num(w.maxLiveShots, `weapons.${w.id}.maxLiveShots`, w.id, { gt: 0 });
    num(w.ammoCost, `weapons.${w.id}.ammoCost`, w.id, { min: 0 });
    // Charge thresholds must be finite, non-negative and strictly ascending.
    let prev = -Infinity;
    for (const [i, t] of w.chargeThresholds.entries()) {
      num(t, `weapons.${w.id}.chargeThresholds[${i}]`, w.id, { min: 0 });
      if (Number.isFinite(t) && !(t > prev)) {
        error({
          code: "charge.threshold",
          definitionId: w.id,
          fieldPath: `weapons.${w.id}.chargeThresholds[${i}]`,
          message: `Charge thresholds must strictly ascend.`,
        });
      }
      prev = t;
    }
    if (w.projectiles.length === 0) {
      error({
        code: "projectile.missing",
        definitionId: w.id,
        fieldPath: `weapons.${w.id}.projectiles`,
        message: `Weapon '${w.id}' has no projectiles.`,
      });
    }
    for (const [i, ref] of w.projectiles.entries()) {
      if (!data.projectiles[ref]) {
        error({
          code: "projectile.missing",
          definitionId: w.id,
          fieldPath: `weapons.${w.id}.projectiles[${i}]`,
          message: `Weapon references unknown projectile '${ref}'.`,
        });
      }
    }
    if (w.firingBehavior !== undefined && !registries.projectiles.has(w.firingBehavior)) {
      // firing behaviours are registered alongside projectile behaviours here
      warn({
        code: "behavior.unknown",
        definitionId: w.id,
        fieldPath: `weapons.${w.id}.firingBehavior`,
        message: `Unknown firing behavior '${w.firingBehavior}'.`,
      });
    }
  }

  // --- enemies ---------------------------------------------------------------
  for (const e of Object.values(data.enemies)) {
    if (!data.actors[e.actor]) {
      error({
        code: "reference.missing",
        definitionId: e.id,
        fieldPath: `enemies.${e.id}.actor`,
        message: `Enemy references unknown actor '${e.actor}'.`,
      });
    }
    num(e.touchDamage, `enemies.${e.id}.touchDamage`, e.id, { min: 0 });
    hitbox(e.hurtbox, `enemies.${e.id}.hurtbox`, e.id);
    hitbox(e.perception, `enemies.${e.id}.perception`, e.id);
    // Each ability id must be a known enemy behaviour.
    for (const [i, ability] of e.abilities.entries()) {
      if (!registries.enemyBehaviors.has(ability)) {
        error({
          code: "behavior.unknown",
          definitionId: e.id,
          fieldPath: `enemies.${e.id}.abilities[${i}]`,
          message: `Unknown enemy behaviour '${ability}'.`,
        });
      }
    }
    // AI reactions must name abilities this enemy owns.
    const owned = new Set(e.abilities);
    for (const [event, names] of Object.entries(e.reactions)) {
      for (const name of names ?? []) {
        if (!owned.has(name)) {
          error({
            code: "reaction.missing",
            definitionId: e.id,
            fieldPath: `enemies.${e.id}.reactions.${event}`,
            message: `Reaction on '${event}' names ability '${name}' the enemy does not own.`,
          });
        }
      }
    }
    for (const [i, hook] of (e.hooks ?? []).entries()) {
      if (hook.ability && !owned.has(hook.ability)) {
        error({
          code: "reaction.missing",
          definitionId: e.id,
          fieldPath: `enemies.${e.id}.hooks[${i}].ability`,
          message: `Hook references ability '${hook.ability}' the enemy does not own.`,
        });
      }
      if (!registries.effects.has(hook.effect)) {
        error({
          code: "behavior.unknown",
          definitionId: e.id,
          fieldPath: `enemies.${e.id}.hooks[${i}].effect`,
          message: `Unknown effect '${hook.effect}'.`,
        });
      }
    }
  }

  // --- pickups ---------------------------------------------------------------
  for (const p of Object.values(data.pickups)) {
    if (!registries.pickups.has(p.behavior)) {
      error({
        code: "behavior.unknown",
        definitionId: p.id,
        fieldPath: `pickups.${p.id}.behavior`,
        message: `Unknown pickup behavior '${p.behavior}'.`,
      });
    }
    num(p.amount, `pickups.${p.id}.amount`, p.id, { gt: 0 });
  }

  // --- environments ----------------------------------------------------------
  for (const env of Object.values(data.environments)) {
    if (!registries.environments.has(env.behavior)) {
      error({
        code: "behavior.unknown",
        definitionId: env.id,
        fieldPath: `environments.${env.id}.behavior`,
        message: `Unknown environment behavior '${env.behavior}'.`,
      });
    }
    for (const [k, v] of Object.entries(env.defaults)) {
      if (typeof v === "number" && !Number.isFinite(v)) {
        error({
          code: "value.number",
          definitionId: env.id,
          fieldPath: `environments.${env.id}.defaults.${k}`,
          message: `Default '${k}' must be finite.`,
        });
      }
    }
  }

  // --- prefabs ---------------------------------------------------------------
  for (const pf of Object.values(data.prefabs)) {
    if (!registries.prefabRuntimes.has(pf.runtime)) {
      error({
        code: "prefab.runtime",
        definitionId: pf.id,
        fieldPath: `prefabs.${pf.id}.runtime`,
        message: `Prefab references unknown runtime '${pf.runtime}'.`,
      });
    }
    if (!resolvePrefabSource(data, pf)) {
      error({
        code: "reference.missing",
        definitionId: pf.id,
        fieldPath: `prefabs.${pf.id}.source`,
        message: `Prefab source could not be resolved.`,
      });
    }
    for (const [i, f] of pf.fields.entries()) {
      if (f.type === "enum" && (!f.enum || f.enum.length === 0)) {
        error({
          code: "field.enum",
          definitionId: pf.id,
          fieldPath: `prefabs.${pf.id}.fields[${i}].enum`,
          message: `Enum field '${f.name}' has no options.`,
        });
      }
      if (f.min !== undefined && f.max !== undefined && f.min > f.max) {
        error({
          code: "field.range",
          definitionId: pf.id,
          fieldPath: `prefabs.${pf.id}.fields[${i}]`,
          message: `Field '${f.name}' has min > max.`,
        });
      }
    }
  }

  if (diagnostics.some((d) => d.severity === "error")) {
    return { ok: false, diagnostics };
  }
  return { ok: true, value: buildCompiled(data), diagnostics };
}

// ---------------------------------------------------------------------------
// Assembly (only reached when no errors were raised)
// ---------------------------------------------------------------------------

function buildCompiled(data: GameData): CompiledGameData {
  const abilities = new Map<string, CompiledAbility>();
  for (const a of sortById(data.abilities)) abilities.set(a.id, compileAbility(a));

  const loadouts = new Map<string, CompiledLoadout>();
  for (const l of sortById(data.loadouts)) loadouts.set(l.id, compileLoadout(l, data));

  const enemies = new Map<string, CompiledEnemy>();
  for (const e of sortById(data.enemies)) enemies.set(e.id, compileEnemy(e, data));

  const weapons = new Map<string, CompiledWeapon>();
  for (const w of sortById(data.weapons)) weapons.set(w.id, compileWeapon(w, data));

  const compiled: CompiledGameData = {
    schemaVersion: data.schemaVersion,
    gameVersion: data.gameVersion,
    physics: Object.freeze({ ...data.physics }),
    actors: mapById(data.actors),
    abilities,
    loadouts,
    enemies,
    weapons,
    projectiles: mapById(data.projectiles),
    pickups: mapById(data.pickups),
    environments: mapById(data.environments),
    prefabs: mapById(data.prefabs),
    hash: "",
  };
  return { ...compiled, hash: hashGameData(compiled) };
}

function compileAbility(a: AbilityDefinition): CompiledAbility {
  return {
    id: a.id,
    behavior: a.behavior,
    layer: a.layer,
    priority: a.priority ?? 0,
    config: Object.freeze({ ...a.config }),
  };
}

function compileLoadout(l: LoadoutDefinition, data: GameData): CompiledLoadout {
  const abilities = l.slots.map((slot) => {
    const base = data.abilities[slot.ability];
    return {
      id: base.id,
      behavior: base.behavior,
      layer: base.layer,
      priority: slot.priority ?? base.priority ?? 0,
      config: Object.freeze({ ...base.config, ...slot.config }),
    } satisfies CompiledAbility;
  });
  return {
    id: l.id,
    actor: data.actors[l.actor],
    abilities,
    weapons: [...l.weapons],
    initialWeapon: l.initialWeapon,
  };
}

function compileEnemy(e: EnemyDefinition, data: GameData): CompiledEnemy {
  const actor = data.actors[e.actor];
  const reactions: Partial<Record<string, readonly string[]>> = {};
  for (const [event, names] of Object.entries(e.reactions)) {
    if (names) reactions[event] = Object.freeze([...names]);
  }
  return {
    id: e.id,
    sheet: e.sheet,
    actor,
    hurtbox: fillHitbox(e.hurtbox),
    perception: fillHitbox(e.perception),
    maxHealth: actor.maxHealth,
    touchDamage: e.touchDamage,
    movement: e.movement,
    shield: e.shield ? { ...e.shield } : undefined,
    abilities: [...e.abilities],
    reactions: Object.freeze(reactions) as CompiledEnemy["reactions"],
    hooks: Object.freeze((e.hooks ?? []).map((h) => ({ ...h }))),
    initialAnimation: e.initialAnimation,
  };
}

function compileWeapon(w: WeaponDefinition, data: GameData): CompiledWeapon {
  return {
    ...w,
    chargeThresholds: [...w.chargeThresholds],
    projectiles: [...w.projectiles],
    resolvedProjectiles: w.projectiles.map((id) => data.projectiles[id]),
  };
}

function fillHitbox(box: Hitbox): Required<Hitbox> {
  return { hw: box.hw, hh: box.hh, ox: box.ox ?? 0, oy: box.oy ?? 0 };
}

function resolvePrefabSource(data: GameData, pf: PrefabDefinition): boolean {
  switch (pf.source.kind) {
    case "loadout":
      return !!data.loadouts[pf.source.ref];
    case "enemy":
      return !!data.enemies[pf.source.ref];
    case "pickup":
      return !!data.pickups[pf.source.ref];
    case "environment":
      return !!data.environments[pf.source.ref];
    case "camera":
      return true;
  }
}

function validateBehaviorConfig(
  set: CompileRegistries["abilities"],
  behavior: string,
  config: unknown,
  path: string,
  id: string,
  error: (d: Omit<GameDataDiagnostic, "severity">) => void,
): void {
  if (!set.validate) return;
  for (const issue of set.validate(behavior, config)) {
    error({
      code: "config.invalid",
      definitionId: id,
      fieldPath: issue.fieldPath ? `${path}.${issue.fieldPath}` : path,
      message: issue.message,
    });
  }
}

// --- deterministic ordering helpers ----------------------------------------

function sortById<T extends { id: string }>(table: Record<string, T>): T[] {
  return Object.values(table).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function mapById<T extends { id: string }>(table: Record<string, T>): ReadonlyMap<string, T> {
  const map = new Map<string, T>();
  for (const def of sortById(table)) map.set(def.id, def);
  return map;
}
