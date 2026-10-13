import type { GameData, GameDataDiagnostic } from "./types.js";

/**
 * Categories a project overlay may add to or replace records in. Only categories
 * the runtime reads from the scene's compiled game data (enemies and their
 * actors; player loadouts resolve actors the same way) plus the level-facing
 * prefab catalog. Everything else — physics, abilities, loadouts, weapons,
 * projectiles, pickups, environments — is still read, at least in part, from
 * the default-data compat constants, so overriding it would change
 * `gameDataHash` without changing gameplay; those keys are rejected.
 */
export const GAME_DATA_OVERLAY_CATEGORIES = ["actors", "enemies", "prefabs"] as const;

export type GameDataOverlayCategory = (typeof GAME_DATA_OVERLAY_CATEGORIES)[number];

/**
 * A project's `data/game.json`: records merged by id over a base {@link GameData}
 * (see {@link mergeGameData}). `schemaVersion`, when present, must match the base.
 */
export type GameDataOverlay = {
  schemaVersion?: number;
} & Partial<Pick<GameData, GameDataOverlayCategory>>;

export type MergeGameDataResult =
  | { ok: true; value: GameData }
  | { ok: false; diagnostics: GameDataDiagnostic[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Merge a project overlay over `base`: per accepted category, overlay records
 * replace base records with the same id and new ids are added; nothing is
 * deleted. Pure — neither input is mutated. The overlay is usually parsed JSON,
 * so its shape is checked here; record contents are left to `compileGameData`.
 */
export function mergeGameData(base: GameData, overlay: GameDataOverlay): MergeGameDataResult {
  const diagnostics: GameDataDiagnostic[] = [];
  const error = (code: string, message: string, fieldPath?: string): void => {
    diagnostics.push({ severity: "error", code, message, ...(fieldPath ? { fieldPath } : {}) });
  };

  if (!isRecord(overlay)) {
    error("overlay.invalid", "Game data overlay must be a JSON object.");
    return { ok: false, diagnostics };
  }

  const merged: GameData = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (key === "schemaVersion") {
      if (value !== base.schemaVersion) {
        error(
          "overlay.schemaVersion",
          `Game data overlay schemaVersion ${JSON.stringify(value)} does not match ${base.schemaVersion}.`,
          key,
        );
      }
      continue;
    }
    if (!(GAME_DATA_OVERLAY_CATEGORIES as readonly string[]).includes(key)) {
      error(
        "overlay.category",
        `Game data overlay category '${key}' is not supported; allowed: ${GAME_DATA_OVERLAY_CATEGORIES.join(", ")}.`,
        key,
      );
      continue;
    }
    if (!isRecord(value)) {
      error("overlay.invalid", `Game data overlay '${key}' must be an object of records.`, key);
      continue;
    }
    for (const [id, record] of Object.entries(value)) {
      if (!isRecord(record)) {
        error(
          "overlay.invalid",
          `Game data overlay '${key}.${id}' must be an object.`,
          `${key}.${id}`,
        );
      }
    }
    const category = key as GameDataOverlayCategory;
    (merged as Record<GameDataOverlayCategory, unknown>)[category] = {
      ...base[category],
      ...value,
    };
  }

  return diagnostics.length > 0 ? { ok: false, diagnostics } : { ok: true, value: merged };
}
