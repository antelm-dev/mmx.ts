import { buildCompileRegistries } from "@mmx/engine/behaviors";
import {
  GAME_DATA,
  compileGameData,
  mergeGameData,
  type GameData,
  type GameDataOverlay,
} from "@mmx/engine/data";

const pick = <T>(records: Record<string, T>, keep: (id: string, record: T) => boolean) =>
  Object.fromEntries(Object.entries(records).filter(([id, record]) => keep(id, record)));

/**
 * The engine's game data without the MMX Starter's objects (C-INDEP): no enemy, pickup
 * or enemy actor, only the projectiles a weapon fires, and only the hazard and
 * camera-zone environments, so the catalog is spawn, hazard, camera zone and slope.
 * Picked by kind, not id, so it needs no list of the pack's objects.
 */
export function baseWithoutPack(): GameData {
  const enemyActors = new Set(Object.values(GAME_DATA.enemies).map((enemy) => enemy.actor));
  const fired = new Set(Object.values(GAME_DATA.weapons).flatMap((weapon) => weapon.projectiles));
  const environments = pick(
    GAME_DATA.environments,
    (id) => id === "hazard" || id === "camera-zone",
  );
  return {
    ...GAME_DATA,
    actors: pick(GAME_DATA.actors, (id) => !enemyActors.has(id)),
    enemies: {},
    pickups: {},
    projectiles: pick(GAME_DATA.projectiles, (id) => fired.has(id)),
    environments,
    prefabs: pick(
      GAME_DATA.prefabs,
      (_, { source }) =>
        source.kind === "loadout" || (source.kind === "environment" && source.ref in environments),
    ),
  };
}

/** Compile errors of `overlay` over `base` (none when it compiles). */
export function compileIssues(base: GameData, overlay: GameDataOverlay): string[] {
  const merged = mergeGameData(base, overlay);
  if (!merged.ok) return merged.diagnostics.map((d) => d.message);
  const compiled = compileGameData(merged.value, buildCompileRegistries());
  return compiled.ok ? [] : compiled.diagnostics.map((d) => d.message);
}
