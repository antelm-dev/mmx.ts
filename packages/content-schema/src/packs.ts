import type { GameDataOverlay } from "@mmx/engine/data";
import starterManifest from "@mmx/pack-mmx-starter/pack.json" with { type: "json" };
import starterData from "@mmx/pack-mmx-starter/data/game.json" with { type: "json" };
import starterAssets from "@mmx/pack-mmx-starter/assets.json" with { type: "json" };
import starterBindings from "@mmx/pack-mmx-starter/bindings.json" with { type: "json" };
import xManifest from "@mmx/pack-mmx-player-x/pack.json" with { type: "json" };
import xData from "@mmx/pack-mmx-player-x/data/game.json" with { type: "json" };
import zeroManifest from "@mmx/pack-mmx-player-zero/pack.json" with { type: "json" };
import zeroData from "@mmx/pack-mmx-player-zero/data/game.json" with { type: "json" };

/** A pack copied into a project, as the manifest's `packs` records it (`ProjectPack`). */
export type PackRef = { id: string; version: number };

/** The MMX Starter pack, as a manifest records it once copied. */
export const MMX_STARTER_PACK: PackRef = {
  id: starterManifest.id,
  version: starterManifest.version,
};

/** A project manifest asset entry; only `id` and `path` are read. */
export type PackAsset = { id: string; path: string };

/** What a pack adds to a project (contract C-INSTALL). */
export type PackContent = {
  ref: PackRef;
  /** Records for `data/game.json`. */
  data: GameDataOverlay;
  /** Manifest entries (`assets.json`), their files at the same project-relative paths. */
  assets: readonly PackAsset[];
  /** Binding groups for `game/data.json`'s `bindings` (`bindings.json`). */
  bindings: Readonly<Record<string, Readonly<Record<string, string>>>>;
};

export const MMX_STARTER: PackContent = {
  ref: MMX_STARTER_PACK,
  data: starterData as GameDataOverlay,
  assets: starterAssets.assets,
  bindings: starterBindings,
};

/** X's records (the pack has no art yet: the starter template carries X's). */
export const MMX_PLAYER_X: PackContent = {
  ref: { id: xManifest.id, version: xManifest.version },
  data: xData as GameDataOverlay,
  assets: [],
  bindings: {},
};

/** Zero's records; his art comes from the Zero import. */
export const MMX_PLAYER_ZERO: PackContent = {
  ref: { id: zeroManifest.id, version: zeroManifest.version },
  data: zeroData as GameDataOverlay,
  assets: [],
  bindings: {},
};

const PLAYER_PACKS = [MMX_PLAYER_X, MMX_PLAYER_ZERO];

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Deep equality of parsed JSON, key order aside. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => key in b && same((a as Json)[key], (b as Json)[key]))
  );
}

/** Whether `own` is an object whose `categories`, when present, are objects of records. */
const hasRecords = (own: unknown, categories: readonly string[]): own is Json =>
  isRecord(own) && categories.every((key) => own[key] === undefined || isRecord(own[key]));

const categoriesOf = (pack: PackContent): string[] =>
  Object.keys(pack.data).filter((key) => key !== "schemaVersion");

export type MergePackInput<M> = {
  manifest: M;
  /** `data/game.json`, undefined when the project has none. */
  overlay: GameDataOverlay | undefined;
  /** `game/data.json`, undefined when the project has none (Play then uses the starter's). */
  bindingsFile?: unknown;
  /** Project paths holding a file other than the pack's: their entries are not added. */
  occupiedPaths?: ReadonlySet<string>;
  /**
   * Whether keys missing from a record the project has are added (default true). An explicit
   * Install fills them; the migration on open (`withStarterPack`) adds whole records only.
   */
  fillKeys?: boolean;
};

export type MergePackResult<M> = {
  manifest: M;
  overlay: GameDataOverlay | undefined;
  bindingsFile: unknown;
  /** What was added, e.g. `record enemies.metool`, `key prefabs.enemy.metool.name`. */
  added: string[];
  /** What the project already has otherwise and keeps, with why. */
  skipped: string[];
};

/**
 * Contract C-INSTALL: add to a project what `pack` has and it lacks — records, keys missing from
 * a record it has, manifest asset entries and binding keys — and set its `packs` entry to the
 * pack's version. Nothing the project has is ever replaced: a differing value is kept and listed
 * in `skipped`. Pure: inputs are not mutated, added values are copies, and an unchanged part is
 * returned as the same object, so a second run adds nothing. An overlay that is not an object of
 * records leaves everything unchanged.
 */
export function mergePack<M extends { packs?: readonly PackRef[]; assets?: readonly PackAsset[] }>(
  input: MergePackInput<M>,
  pack: PackContent = MMX_STARTER,
): MergePackResult<M> {
  const { manifest, overlay, bindingsFile } = input;
  const added: string[] = [];
  const skipped: string[] = [];
  const own = (overlay ?? {}) as Json;
  const categories = categoriesOf(pack);
  if (!hasRecords(own, categories)) {
    skipped.push("data/game.json: not an object of records, left for the merge to report");
    return { manifest, overlay, bindingsFile, added, skipped };
  }

  // Records: the project's in its order, then the pack's it lacks (a new file reads like a template's).
  const nextOverlay: Json = { schemaVersion: pack.data.schemaVersion, ...own };
  for (const category of categories) {
    const existing = (own[category] ?? {}) as Json;
    const records: Json = { ...existing };
    for (const [id, record] of Object.entries((pack.data as Json)[category] as Json)) {
      const mine = existing[id];
      const name = `${category}.${id}`;
      if (mine === undefined) {
        records[id] = structuredClone(record);
        added.push(`record ${name}`);
        continue;
      }
      if (!isRecord(mine) || !isRecord(record)) continue;
      const missing = Object.keys(record).filter((key) => !(key in mine));
      if (missing.length > 0 && input.fillKeys !== false) {
        records[id] = {
          ...mine,
          ...structuredClone(Object.fromEntries(missing.map((key) => [key, record[key]]))),
        };
        added.push(...missing.map((key) => `key ${name}.${key}`));
      }
      if (Object.keys(record).some((key) => key in mine && !same(mine[key], record[key]))) {
        skipped.push(`record ${name}: the project's values kept`);
      }
    }
    nextOverlay[category] = records;
  }
  const dataChanged = added.length > 0;

  // Manifest entries: by id; one whose path holds another file would draw that file.
  const assets = manifest.assets ?? [];
  const newAssets: PackAsset[] = [];
  for (const entry of pack.assets) {
    const mine = assets.find((asset) => asset.id === entry.id);
    if (mine) {
      if (!same(mine, entry)) skipped.push(`asset ${entry.id}: the project's entry kept`);
    } else if (input.occupiedPaths?.has(entry.path)) {
      skipped.push(`asset ${entry.id}: ${entry.path} holds another file`);
    } else {
      newAssets.push(structuredClone(entry));
      added.push(`asset ${entry.id}`);
    }
  }

  let nextBindingsFile = bindingsFile;
  if (Object.keys(pack.bindings).length > 0) {
    const file = bindingsFile;
    if (file === undefined) {
      skipped.push("bindings: no game/data.json, Play uses the starter's");
    } else if (!isRecord(file) || (file.bindings !== undefined && !isRecord(file.bindings))) {
      skipped.push("bindings: game/data.json has no bindings object");
    } else {
      const bindings: Json = { ...(file.bindings as Json | undefined) };
      const ids = new Set([...assets, ...newAssets].map((asset) => asset.id));
      const before = added.length;
      for (const [group, entries] of Object.entries(pack.bindings)) {
        const mine = bindings[group] ?? {};
        if (!isRecord(mine)) {
          skipped.push(`binding ${group}: not an object`);
          continue;
        }
        const next: Json = { ...mine };
        for (const [key, value] of Object.entries(entries)) {
          const legacy = group === "pickupAnimations" ? lifeCapsuleKind(pack, key) : undefined;
          if (key in next) {
            if (next[key] !== value) skipped.push(`binding ${group}.${key}: the project's kept`);
          } else if (legacy !== undefined && legacy in next) {
            // Older bindings key a life capsule by its Kind; the sheet key would take over.
            skipped.push(`binding ${group}.${key}: bound by its older key '${legacy}'`);
          } else if (!ids.has(value)) {
            skipped.push(`binding ${group}.${key}: ${value} is not in the project`);
          } else {
            next[key] = value;
            added.push(`binding ${group}.${key}`);
          }
        }
        bindings[group] = next;
      }
      if (added.length > before) nextBindingsFile = { ...file, bindings };
    }
  }

  let packs = manifest.packs;
  const current = packs?.find((entry) => entry.id === pack.ref.id);
  if (!current) {
    packs = [...(packs ?? []), { ...pack.ref }];
    added.push(`pack ${pack.ref.id} v${pack.ref.version}`);
  } else if (current.version < pack.ref.version) {
    packs = packs!.map((entry) => (entry === current ? { ...pack.ref } : entry));
    added.push(`pack ${pack.ref.id} v${current.version} → v${pack.ref.version}`);
  } else if (current.version > pack.ref.version) {
    skipped.push(
      `pack ${pack.ref.id}: the project has v${current.version}, newer than v${pack.ref.version}`,
    );
  }

  return {
    manifest:
      packs === manifest.packs && newAssets.length === 0
        ? manifest
        : {
            ...manifest,
            packs,
            ...(newAssets.length > 0 ? { assets: [...assets, ...newAssets] } : {}),
          },
    overlay: dataChanged ? (nextOverlay as GameDataOverlay) : overlay,
    bindingsFile: nextBindingsFile,
    added,
    skipped,
  };
}

/** The Kind (`small`/`large`) of the pack's life capsule drawn from `sheet`, if any. */
function lifeCapsuleKind(pack: PackContent, sheet: string): string | undefined {
  const pickup = Object.values(pack.data.pickups ?? {}).find(
    (entry) => entry.sheet === sheet && entry.id.startsWith("life."),
  );
  return pickup?.id.slice("life.".length);
}

export type WithStarterPack<M> = {
  manifest: M;
  overlay: GameDataOverlay | undefined;
  /** Whether anything was added: the caller then has something to save. */
  changed: boolean;
};

/**
 * Contracts C-MIGRATE and C-MULTI: the packs a project lacks are added as data only
 * ({@link mergePack}: the records its `data/game.json` lacks, never keys inside a record it has, so
 * a field removed on purpose stays removed; a record it has always wins), with their `packs`
 * markers. A manifest without `packs` predates packs and gets the MMX Starter, X and Zero; one
 * with packs but no player pack gets X and Zero together. `packs: []` (base only), a project with
 * a player pack already, and a malformed `packs` are returned as is. So is an overlay that is not
 * an object of records, left for the merge to report so a fixed file still migrates. Art and
 * bindings come with the template or File → Install / update MMX Starter pack….
 */
export function withStarterPack<M extends { packs?: readonly PackRef[] }>(
  manifest: M,
  overlay: GameDataOverlay | undefined,
): WithStarterPack<M> {
  const unchanged = { manifest, overlay, changed: false };
  const { packs } = manifest;
  const isPlayer = (entry: Json) => PLAYER_PACKS.some((pack) => pack.ref.id === entry.id);
  const missing =
    packs === undefined
      ? [MMX_STARTER, ...PLAYER_PACKS]
      : Array.isArray(packs) && packs.length > 0 && packs.every(isRecord) && !packs.some(isPlayer)
        ? PLAYER_PACKS
        : [];
  if (missing.length === 0 || !hasRecords(overlay ?? {}, missing.flatMap(categoriesOf))) {
    return unchanged;
  }
  let next = { manifest, overlay };
  for (const pack of missing) {
    // No assets are added, so whatever the manifest's are is never read.
    const merged = mergePack(
      {
        manifest: next.manifest as M & { assets?: readonly PackAsset[] },
        overlay: next.overlay,
        fillKeys: false,
      },
      { ...pack, assets: [], bindings: {} },
    );
    next = { manifest: merged.manifest, overlay: merged.overlay };
  }
  // Each pack's marker is new, so something always changed.
  return { ...next, changed: true };
}
