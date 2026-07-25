/**
 * Typed authoring model for the engine's gameplay content.
 *
 * These interfaces describe *raw* definitions — what a human (or a generated
 * module) writes with {@link defineGameData}. They are deliberately plain data:
 * numbers, strings, and stable string references to executable behaviour that
 * lives in code (see the behaviour registries). No functions, no class
 * constructors, no expressions.
 *
 * Raw definitions are turned into a {@link CompiledGameData} exactly once, by
 * `compileGameData`, which validates them, resolves every reference, and freezes
 * the result. Runtime code only ever consumes the compiled form.
 */

// ---------------------------------------------------------------------------
// Shared value types
// ---------------------------------------------------------------------------

/** An axis-aligned box, in half-extents, optionally offset from its owner's origin. */
export interface Hitbox {
  hw: number;
  hh: number;
  /** Offset of the box centre from the entity origin. Defaults to 0. */
  ox?: number;
  oy?: number;
}

/** A 2D offset in world/local pixels. */
export interface Offset {
  x: number;
  y: number;
}

/** Which arbitration layer an ability lives on (see AbilityUser). */
export type AbilityLayer = "locomotion" | "action" | "reaction";

/** Movement model an enemy body uses. */
export type MovementModel = "ground" | "flying";

/**
 * The AI events an enemy can react to. Mirrors {@link AIEvents} in EnemyAI, kept
 * as a closed union so the compiler can flag a reaction wired to a typo'd event.
 */
export type AIEvent =
  | "idle"
  | "see_player"
  | "touch_player"
  | "guard_break"
  | "get_hit"
  | "death"
  | "hit_wall";

// ---------------------------------------------------------------------------
// Definitions
// ---------------------------------------------------------------------------

/**
 * Global-ish physics tuning. The genuinely inviolable invariants (fixed step,
 * tile size) stay in core/constants; these are the numbers a designer can move
 * without breaking the simulation's structural assumptions.
 */
export interface PhysicsDefinition {
  gravity: number;
  maxFallVelocity: number;
  floorSnapLength: number;
}

/** A body: what collides with terrain, plus how much health it starts with. */
export interface ActorDefinition {
  id: string;
  body: Hitbox;
  maxHealth: number;
}

/**
 * One ability's behaviour reference plus its typed configuration.
 *
 * `behavior` names an entry in the {@link AbilityRegistry}; `config` is that
 * entry's configuration, validated at compile time by the registry's `validate`.
 * The raw type keeps `config` open (`Record<string, ...>`); the compiled form
 * carries the narrowed value.
 */
export interface AbilityDefinition {
  id: string;
  behavior: string;
  layer: AbilityLayer;
  /** Locomotion arbitration priority; higher wins. Ignored for non-locomotion. */
  priority?: number;
  config?: Record<string, number | string | boolean | Offset | Hitbox | number[]>;
}

/** One slot in a loadout: an ability, with optional per-loadout overrides. */
export interface LoadoutSlot {
  /** References an {@link AbilityDefinition.id}. */
  ability: string;
  /** Overrides the ability's default arbitration priority in this loadout. */
  priority?: number;
  /** Shallow-merged over the ability's default config for this loadout. */
  config?: Record<string, number | string | boolean | Offset | Hitbox | number[]>;
}

/** A composed actor: its body, its ordered ability slots, and its arsenal. */
export interface LoadoutDefinition {
  id: string;
  /** References an {@link ActorDefinition.id}. */
  actor: string;
  /** Ability slots, in composition order (ties in priority resolve by this order). */
  slots: LoadoutSlot[];
  /** Weapon ids the actor may cycle through; first-class ordering. */
  weapons: string[];
  /** Which weapon is equipped at spawn; must be one of {@link weapons}. */
  initialWeapon: string;
}

/**
 * A special, non-locomotion reaction wired to a registered effect rather than an
 * ability — e.g. the bat re-anchoring its hover when a recoil ends. The effect
 * is a stable registry id with typed config; never a callback in data.
 */
export interface ReactionHook {
  /** The engine signal that fires this hook. */
  on: "ability_end";
  /** For `ability_end`, the ability whose ending triggers it. */
  ability?: string;
  /** References an entry in the effect registry. */
  effect: string;
  config?: Record<string, number | string | boolean>;
}

/**
 * An enemy archetype. Composition + tuning as data; the algorithms behind each
 * ability id stay in code.
 */
export interface EnemyDefinition {
  id: string;
  /** Animation sheet key. */
  sheet: string;
  /** References an {@link ActorDefinition.id} for the terrain-collision body. */
  actor: string;
  /** What player projectiles test against. */
  hurtbox: Hitbox;
  /** Contact damage dealt to the player. */
  touchDamage: number;
  movement: MovementModel;
  /** AI vision box (half-extents + vertical offset from the body centre). */
  perception: Hitbox;
  /** Present if the enemy guards; absent for unshielded enemies. */
  shield?: { breakable: boolean };
  /** Ability ids this enemy owns, in composition order. */
  abilities: string[];
  /** Which abilities answer which AI events. */
  reactions: Partial<Record<AIEvent, string[]>>;
  /** Registered special reactions (see {@link ReactionHook}). */
  hooks?: ReactionHook[];
  initialAnimation: string;
}

/** A weapon: ammo economy, charge tiers, and which projectiles it fires. */
export interface WeaponDefinition {
  id: string;
  /** A finite tank, or infinite (the buster). */
  maxAmmo: number | "infinite";
  maxLiveShots: number;
  /** Charge hold thresholds, in seconds, ascending. Empty for uncharged weapons. */
  chargeThresholds: number[];
  /** Projectile ids indexed by charge level; index clamps to the last entry. */
  projectiles: string[];
  /** Ammo spent per shot (0 for infinite weapons). */
  ammoCost: number;
  /** Optional specialized firing behaviour id; default straight-fire when absent. */
  firingBehavior?: string;
}

/** A projectile: how it moves (by id), what it hits, and how it looks. */
export interface ProjectileDefinition {
  id: string;
  /** References a {@link ProjectileBehaviorRegistry} entry (movement algorithm). */
  behavior: string;
  damage: number;
  speed: number;
  hitbox: Hitbox;
  spawnOffset: Offset;
  /** Seconds the spent shot lingers while its hit particle plays. */
  lifetime: number;
  breaksGuard: boolean;
  hitFx: string;
  animation: {
    kind: string;
    frameMs: number;
    frameCount?: number;
    randomStartFrame: boolean;
  };
  /** randf_range(-r, r) vertical spawn scatter; drives deterministic RNG. */
  verticalRange: number;
}

/** A pickup: what it grants and how much. */
export interface PickupDefinition {
  id: string;
  /** References a {@link PickupEffectRegistry} entry. */
  behavior: string;
  sheet: string;
  /** Health or ammo restored. */
  amount: number;
}

/** An environment object: a behaviour plus its default field values. */
export interface EnvironmentDefinition {
  id: string;
  /** References an {@link EnvironmentBehaviorRegistry} entry. */
  behavior: string;
  /** Default field values, overridable per level instance. */
  defaults: Record<string, number | boolean>;
}

/** A single typed override field a prefab exposes to a level author. */
export interface PrefabField {
  name: string;
  type: "number" | "boolean" | "string" | "enum";
  default: number | boolean | string;
  min?: number;
  max?: number;
  enum?: readonly string[];
  required?: boolean;
}

/**
 * A stable, level-facing spawnable. Prefabs are what {@link LevelEntity.prefabId}
 * references; they resolve to a runtime behaviour and to one of the definition
 * categories above.
 */
export interface PrefabDefinition {
  id: string;
  /** References a {@link PrefabRuntimeRegistry} entry that spawns it. */
  runtime: string;
  /** Which definition category this prefab draws from, and the id within it. */
  source:
    | { kind: "loadout"; ref: string }
    | { kind: "enemy"; ref: string }
    | { kind: "pickup"; ref: string }
    | { kind: "environment"; ref: string }
    | { kind: "camera" };
  /** Typed override fields exposed to level authoring. */
  fields: PrefabField[];
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export interface GameData {
  schemaVersion: number;
  gameVersion: string;
  physics: PhysicsDefinition;
  actors: Record<string, ActorDefinition>;
  abilities: Record<string, AbilityDefinition>;
  loadouts: Record<string, LoadoutDefinition>;
  enemies: Record<string, EnemyDefinition>;
  weapons: Record<string, WeaponDefinition>;
  projectiles: Record<string, ProjectileDefinition>;
  pickups: Record<string, PickupDefinition>;
  environments: Record<string, EnvironmentDefinition>;
  prefabs: Record<string, PrefabDefinition>;
}

// ---------------------------------------------------------------------------
// Compilation diagnostics
// ---------------------------------------------------------------------------

export type DiagnosticSeverity = "error" | "warning";

/** One structured problem found while compiling game data. */
export interface GameDataDiagnostic {
  severity: DiagnosticSeverity;
  /** Stable machine-readable code, e.g. "reference.missing". */
  code: string;
  message: string;
  /** The definition the problem concerns, when definition-specific. */
  definitionId?: string;
  /** Dotted path to the offending field, when field-specific. */
  fieldPath?: string;
}

// ---------------------------------------------------------------------------
// Compiled representation
// ---------------------------------------------------------------------------

/**
 * A compiled ability: the validated config, plus the resolved arbitration
 * metadata. The registry entry itself is resolved by the runtime from
 * {@link behavior}; it is intentionally NOT stored here so the compiled data
 * hashes and serializes as pure values.
 */
export interface CompiledAbility {
  id: string;
  behavior: string;
  layer: AbilityLayer;
  priority: number;
  config: Readonly<Record<string, unknown>>;
}

export interface CompiledLoadout {
  id: string;
  actor: ActorDefinition;
  /** Resolved, config-merged ability slots in composition order. */
  abilities: CompiledAbility[];
  weapons: string[];
  initialWeapon: string;
}

/** A compiled enemy, with its reaction table pre-flattened for fast lookup. */
export interface CompiledEnemy {
  id: string;
  sheet: string;
  actor: ActorDefinition;
  hurtbox: Required<Hitbox>;
  perception: Required<Hitbox>;
  maxHealth: number;
  touchDamage: number;
  movement: MovementModel;
  shield?: { breakable: boolean };
  abilities: string[];
  /** Precomputed AI reaction lookup: event → ability ids. */
  reactions: Readonly<Partial<Record<AIEvent, readonly string[]>>>;
  hooks: readonly ReactionHook[];
  initialAnimation: string;
}

export interface CompiledWeapon extends WeaponDefinition {
  /** Resolved projectile definitions, indexed like {@link WeaponDefinition.projectiles}. */
  resolvedProjectiles: ProjectileDefinition[];
}

/**
 * The frozen, validated, reference-resolved gameplay content the runtime reads.
 * Definition ordering is stable (sorted by id) so the {@link hash} is
 * deterministic across builds.
 */
export interface CompiledGameData {
  schemaVersion: number;
  gameVersion: string;
  physics: Readonly<PhysicsDefinition>;
  actors: ReadonlyMap<string, ActorDefinition>;
  abilities: ReadonlyMap<string, CompiledAbility>;
  loadouts: ReadonlyMap<string, CompiledLoadout>;
  enemies: ReadonlyMap<string, CompiledEnemy>;
  weapons: ReadonlyMap<string, CompiledWeapon>;
  projectiles: ReadonlyMap<string, ProjectileDefinition>;
  pickups: ReadonlyMap<string, PickupDefinition>;
  environments: ReadonlyMap<string, EnvironmentDefinition>;
  prefabs: ReadonlyMap<string, PrefabDefinition>;
  /** Deterministic content hash over all gameplay-relevant values. */
  hash: string;
}

/** Result of {@link compileGameData} — never a partial compiled value on failure. */
export type CompileGameDataResult =
  | { ok: true; value: CompiledGameData; diagnostics: GameDataDiagnostic[] }
  | { ok: false; diagnostics: GameDataDiagnostic[] };

/**
 * The registry surfaces compilation validates against. Each is a set of known
 * behaviour ids plus, optionally, a per-id config validator. Kept as an
 * interface so the runtime can pass its real registries and a test can pass a
 * stub set of ids.
 */
export interface CompileRegistries {
  abilities: BehaviorValidatorSet;
  /** Enemy ability ids (a distinct hierarchy from player abilities). */
  enemyBehaviors: BehaviorValidatorSet;
  projectiles: BehaviorValidatorSet;
  pickups: BehaviorValidatorSet;
  environments: BehaviorValidatorSet;
  prefabRuntimes: BehaviorValidatorSet;
  /** Effect ids referenceable from {@link ReactionHook.effect}. */
  effects: BehaviorValidatorSet;
}

export interface ValidationIssue {
  fieldPath?: string;
  message: string;
}

export interface BehaviorValidatorSet {
  has(id: string): boolean;
  /**
   * Validate a config for a behaviour id. Returns the issues found (empty when
   * valid). Absent validator ⇒ config accepted as-is.
   */
  validate?(id: string, config: unknown): ValidationIssue[];
}
