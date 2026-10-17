import type { GameDataOverlay } from "@mmx/engine/data";
import starterManifest from "@mmx/pack-mmx-starter/pack.json" with { type: "json" };
import starterData from "@mmx/pack-mmx-starter/data/game.json" with { type: "json" };

/** A pack copied into a project, as the manifest's `packs` records it (`ProjectPack`). */
export type PackRef = { id: string; version: number };

/** The MMX Starter pack, as a manifest records it once copied. */
export const MMX_STARTER_PACK: PackRef = {
  id: starterManifest.id,
  version: starterManifest.version,
};

const STARTER_DATA = starterData as GameDataOverlay;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export type WithStarterPack<M> = {
  manifest: M;
  overlay: GameDataOverlay | undefined;
  /** Whether anything was added: the caller then has something to save. */
  changed: boolean;
};

/**
 * Contract C-MIGRATE: a project whose manifest has no `packs` predates packs, so
 * it gets the MMX Starter records its overlay (`data/game.json`) lacks, by id and
 * category, and `packs: [MMX Starter]`. A manifest with `packs` (even `[]`) is
 * returned as is. A record the project has is never replaced. Pure: the inputs
 * are not mutated. An overlay that is not an object of records is left for the
 * merge to report, unmigrated, so a fixed file still migrates.
 */
export function withStarterPack<M extends { packs?: readonly PackRef[] }>(
  manifest: M,
  overlay: GameDataOverlay | undefined,
): WithStarterPack<M> {
  const unchanged = { manifest, overlay, changed: false };
  if (manifest.packs !== undefined) return unchanged;
  if (overlay !== undefined && !isRecord(overlay)) return unchanged;
  const own = (overlay ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = {
    schemaVersion: STARTER_DATA.schemaVersion,
    ...own,
  };
  for (const [category, records] of Object.entries(STARTER_DATA)) {
    if (category === "schemaVersion") continue;
    const existing = own[category];
    if (existing !== undefined && !isRecord(existing)) return unchanged;
    // Pack records first, so a migrated file reads like a template's; the project's win.
    next[category] = { ...(records as object), ...(existing as object | undefined) };
  }
  return {
    manifest: { ...manifest, packs: [{ ...MMX_STARTER_PACK }] },
    overlay: next as GameDataOverlay,
    changed: true,
  };
}
