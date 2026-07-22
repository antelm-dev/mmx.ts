/**
 * The editor's content model — a deliberately separate layer from the engine's
 * runtime shapes.
 *
 * Four kinds of thing are kept strictly distinct across this package:
 *
 *   1. {@link GameObjectDefinition} — a reusable prefab. "What a Metool is."
 *   2. {@link LevelObjectInstance} — one placement of a definition in a level.
 *   3. Runtime engine objects (`Enemy`, `MovingPlatform`, …) live in @mmx/engine
 *      and are built from {@link LevelData} by `loadLevel`; the editor never
 *      constructs them except while a Play session is running.
 *   4. Renderer/audio assets live in @mmx/renderer-pixi and apps/web.
 *
 * The document below is the *authoring* shape. It is converted to the engine's
 * {@link LevelData} by the adapters in ./adapters.ts, which is the only place the
 * two representations meet.
 */

/** Current on-disk schema version. Bumped only by a migration in ./migrate.ts. */
export const SCHEMA_VERSION = 1;

/** How a definition is placed in the viewport. */
export type Placement = "point" | "rectangle" | "path";

/**
 * The kind of value an editable property holds. Drives which inspector control
 * is rendered and how the value is validated and coerced.
 */
export type PropertyType = "number" | "boolean" | "string" | "enum";

/**
 * Inspector-facing metadata for one editable field of a definition.
 *
 * The field lives either on the instance transform (x/y/width/height/rotation)
 * or inside {@link LevelObjectInstance.overrides}, keyed by {@link key}. Which,
 * is decided by {@link PropertyMeta.scope}.
 */
export interface PropertyMeta {
  /** Storage key. For overrides this is the LDtk field name, e.g. "FacesRight". */
  key: string;
  /** Human label shown in the inspector. */
  label: string;
  type: PropertyType;
  /** Where the value is stored on the instance. Defaults to "override". */
  scope?: "transform" | "override";
  /** Allowed values for an `enum` field. */
  options?: readonly string[];
  /** Value used when the instance carries no override for this key. */
  default?: unknown;
  /** Inclusive minimum for a `number` field. */
  min?: number;
  /** Inclusive maximum for a `number` field. */
  max?: number;
  /** Numbers below this are invalid unless zero is explicitly allowed. */
  nonNegative?: boolean;
  /** Short help text shown under the control. */
  help?: string;
}

/**
 * A reusable object definition (prefab). Immutable catalog data — see
 * ./definitions.ts. `components` is intentionally open-ended so future object
 * types can carry structured registered-behaviour config without a schema bump.
 */
export interface GameObjectDefinition {
  /** Stable definition id, e.g. "enemy.metool". Referenced by instances. */
  id: string;
  /** Display name, e.g. "Metool". */
  name: string;
  /** Palette category: spawn | enemy | pickup | platform | hazard | conveyor | slope | camera. */
  category: string;
  /** Optional emoji/glyph icon for the palette and viewport label. */
  icon?: string;
  /** The engine-facing LDtk entity id this definition emits, e.g. "Enemy". */
  engineId: string;
  /**
   * Registered-behaviour configuration, keyed by component name. Values are
   * validated, editable data — never executable code.
   */
  components: Record<string, unknown>;
  /** Base LDtk field values written for every instance, before overrides. */
  fields: Record<string, unknown>;
  /** Default box size in world pixels for a freshly placed instance. */
  defaultSize: { width: number; height: number };
  editor: {
    placement: Placement;
    resizable?: boolean;
    /** Accent colour (hex string) for the viewport box and palette chip. */
    color: string;
  };
  /** Editable fields exposed by the inspector, in display order. */
  properties: readonly PropertyMeta[];
}

/**
 * One placed object in a level. `id` is the stable LDtk instance id (iid), which
 * is what makes a round-trip through {@link LevelData} idempotent.
 */
export interface LevelObjectInstance {
  id: string;
  definitionId: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  /** Per-instance field values, layered over the definition's `fields`. */
  overrides?: Record<string, unknown>;
}

/**
 * A whole authored level. `tiles`/`slopes` carry the baked terrain unchanged
 * from the LDtk import so Play mode can hand them straight to the engine, while
 * `objects` are the editor-authored entities.
 */
export interface LevelDocument {
  schemaVersion: number;
  id: string;
  name: string;
  gridSize: number;
  cols: number;
  rows: number;
  /** Row-major terrain, length cols * rows. Tile enum values (see @mmx/engine World.Tile). */
  tiles: number[];
  /** Non-45-degree slope profiles, keyed by row-major tile index, as [left, right]. */
  slopes?: Record<number, [number, number]>;
  objects: LevelObjectInstance[];
}

/** A project groups levels and pins the schema version they were authored at. */
export interface GameProject {
  schemaVersion: number;
  id: string;
  name: string;
  levels: LevelDocument[];
}

/** Severity of a validation problem. `error` blocks Play mode; `warning` does not. */
export type Severity = "error" | "warning";

/** One validation problem, optionally anchored to an object and/or a field. */
export interface ValidationIssue {
  severity: Severity;
  message: string;
  /** Instance id this issue concerns, when it is about a single object. */
  objectId?: string;
  /** Field key this issue concerns, for beside-the-control display in the inspector. */
  field?: string;
  /** Short machine code, e.g. "spawn.count". */
  code: string;
}

export interface ValidationResult {
  issues: ValidationIssue[];
  ok: boolean;
  errorCount: number;
  warningCount: number;
}
