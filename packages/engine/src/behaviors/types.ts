import type { CompiledGameData } from "../data/types.js";
import type { DebugPrimitive, EntityTransform } from "./geometryTypes.js";

/**
 * Behaviour registries — the bridge between data (stable string ids + validated
 * config) and code (the algorithms those ids name).
 *
 * A raw definition references executable behaviour as `behavior: "player.dash"`;
 * the registry entry for that id knows how to *validate* the config and how to
 * *create* the runtime instance. Compilation resolves the id to its entry and
 * fails when the id is unknown or the config is malformed — behaviour is never
 * embedded in data, and unsupported configuration is never silently ignored.
 */

export interface ValidationIssue {
  /** Dotted path within the config to the offending field, when field-specific. */
  fieldPath?: string;
  message: string;
}

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

/**
 * The typed runtime context a behaviour's `create` receives. Intentionally small
 * for now — it carries the compiled game data so a behaviour can resolve sibling
 * definitions — and is extended per-domain as behaviours are wired (Parts 5–9).
 */
export interface RuntimeContext {
  readonly gameData: CompiledGameData;
}

/** The minimal shape the {@link Registry} indexes by. */
export interface RegistryEntry {
  readonly id: string;
  validate(input: unknown): ValidationResult<unknown>;
}

/**
 * One registered behaviour: a stable id, a config validator, a creation function
 * receiving a typed runtime context, and an optional design-time geometry
 * provider (Part 11). Providers must be pure and deterministic.
 */
export interface BehaviorFactory<TOwner, TConfig, TResult> extends RegistryEntry {
  validate(input: unknown): ValidationResult<TConfig>;
  create(owner: TOwner, config: TConfig, context: RuntimeContext): TResult;
  debugGeometry?(config: TConfig, transform: EntityTransform): readonly DebugPrimitive[];
}

/**
 * A deterministic behaviour registry.
 *
 * Registration order does not matter — {@link ids} always returns a sorted list —
 * so two builds enumerate the same behaviours in the same order. Duplicate ids
 * and unknown lookups throw rather than silently winning or returning undefined.
 *
 * Doubles as a {@link BehaviorValidatorSet} (see data/types): `has` + `validate`
 * let {@link compileGameData} validate raw data against the real registries.
 */
export class Registry<F extends RegistryEntry> {
  private readonly entries = new Map<string, F>();

  register(factory: F): this {
    if (this.entries.has(factory.id)) {
      throw new Error(`Registry: duplicate behaviour id '${factory.id}'.`);
    }
    this.entries.set(factory.id, factory);
    return this;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  /** Resolve an id to its entry, throwing when absent (never a silent miss). */
  get(id: string): F {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Registry: unknown behaviour id '${id}'.`);
    return entry;
  }

  /** Every registered id, sorted — a stable, deterministic enumeration order. */
  ids(): string[] {
    return [...this.entries.keys()].sort();
  }

  /** {@link BehaviorValidatorSet} adapter: issues for a config, empty when valid. */
  validate(id: string, config: unknown): ValidationIssue[] {
    const entry = this.entries.get(id);
    if (!entry) return [{ message: `unknown behaviour '${id}'` }];
    const result = entry.validate(config);
    return result.ok ? [] : result.issues;
  }
}

/**
 * Placeholder `create` for behaviours whose runtime instantiation is wired in a
 * later migration stage. Throwing (rather than returning a dummy) keeps the
 * staging honest: nothing spawns through an unwired behaviour by accident.
 */
export function notWired(id: string, stage: string): never {
  throw new Error(`behaviour '${id}' is registered but its runtime create() is wired in ${stage}.`);
}
