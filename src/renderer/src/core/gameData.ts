import { buildCompileRegistries } from "@mmx/engine/behaviors";
import {
  COMPILED_GAME_DATA,
  GAME_DATA,
  compileGameData,
  mergeGameData,
  type CompiledGameData,
  type GameData,
  type GameDataDiagnostic,
  type GameDataOverlay,
} from "@mmx/engine/data";
import type { ProjectIssue } from "@mmx/project-io";

/** A project's game data: the engine's merged with its `data/game.json`, compiled. */
export type ProjectGameData = {
  data: GameData;
  compiled: CompiledGameData;
  /** Merge/compile errors (Problems); when any, `data`/`compiled` are the engine defaults. */
  issues: ProjectIssue[];
  /** The same errors with their `fieldPath`, for inline display. */
  diagnostics: GameDataDiagnostic[];
};

const GAME_DATA_PATH = "/data/game.json";
const DEFAULT_GAME_DATA: ProjectGameData = { data: GAME_DATA, compiled: COMPILED_GAME_DATA, issues: [], diagnostics: [] };
const compiledOverlays = new WeakMap<GameDataOverlay, ProjectGameData>();

function failed(all: GameDataDiagnostic[]): ProjectGameData {
  const diagnostics = all.filter((d) => d.severity === "error");
  const issues = diagnostics.map((d): ProjectIssue => ({
    severity: "error",
    code: `game-data.${d.code}`,
    path: GAME_DATA_PATH,
    message: `data/game.json${d.fieldPath ? ` ${d.fieldPath}` : ""}: ${d.message}`,
  }));
  return { ...DEFAULT_GAME_DATA, issues, diagnostics };
}

function compile(overlay: GameDataOverlay): ProjectGameData {
  const merged = mergeGameData(GAME_DATA, overlay);
  if (!merged.ok) return failed(merged.diagnostics);
  try {
    const compiled = compileGameData(merged.value, buildCompileRegistries());
    if (!compiled.ok) return failed(compiled.diagnostics);
    return { data: merged.value, compiled: compiled.value, issues: [], diagnostics: [] };
  } catch (error) {
    // compileGameData trusts record shapes; a record missing a nested object throws.
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...DEFAULT_GAME_DATA,
      issues: [{ severity: "error", code: "game-data.invalid", path: GAME_DATA_PATH, message: `data/game.json is malformed: ${message}` }],
    };
  }
}

/** Merge and compile a project's overlay (memoized per overlay object); the engine's data without one. */
export function projectGameData(overlay: GameDataOverlay | undefined): ProjectGameData {
  if (!overlay) return DEFAULT_GAME_DATA;
  let result = compiledOverlays.get(overlay);
  if (!result) {
    result = compile(overlay);
    compiledOverlays.set(overlay, result);
  }
  return result;
}

export type NewEnemyInput = {
  name: string;
  /** Enemy id (in `enemies`) to copy, e.g. "metool". */
  base: string;
  /** Animation asset id the enemy is drawn from. */
  sheet: string;
  health: number;
  touchDamage: number;
};

/** "Spiky Crab" → "spiky-crab"; empty when nothing usable is left. */
export function enemySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The first free enemy slug for `name` in `data` ("crab", "crab-2", …). */
export function uniqueEnemySlug(data: GameData, name: string): string {
  const base = enemySlug(name) || "enemy";
  const taken = (slug: string) =>
    slug in data.enemies || `enemy.${slug}` in data.prefabs || `enemy.${slug}` in data.actors;
  let slug = base;
  for (let n = 2; taken(slug); n++) slug = `${base}-${n}`;
  return slug;
}

/**
 * Add a new enemy copied from `input.base` to the overlay: its actor `enemy.<slug>`
 * (with the health), enemy `<slug>` (with the sheet and touch damage) and placeable
 * prefab `enemy.<slug>`, named like the built-ins. Returns the next overlay and the
 * prefab id, which is also the palette definition id.
 */
export function addEnemy(
  overlay: GameDataOverlay | undefined,
  data: GameData,
  input: NewEnemyInput,
): { overlay: GameDataOverlay; id: string } {
  const baseEnemy = data.enemies[input.base];
  const basePrefab = Object.values(data.prefabs).find(
    (prefab) => prefab.source.kind === "enemy" && prefab.source.ref === input.base,
  );
  const baseActor = baseEnemy && data.actors[baseEnemy.actor];
  if (!baseEnemy || !basePrefab || !baseActor) throw new Error(`Unknown enemy '${input.base}'.`);

  const slug = uniqueEnemySlug(data, input.name);
  const id = `enemy.${slug}`;
  const next: GameDataOverlay = {
    schemaVersion: GAME_DATA.schemaVersion,
    ...overlay,
    actors: { ...overlay?.actors, [id]: { ...baseActor, id, maxHealth: input.health } },
    enemies: {
      ...overlay?.enemies,
      [slug]: { ...baseEnemy, id: slug, actor: id, sheet: input.sheet, touchDamage: input.touchDamage },
    },
    prefabs: { ...overlay?.prefabs, [id]: { ...basePrefab, id, source: { kind: "enemy", ref: slug } } },
  };
  return { overlay: next, id };
}
