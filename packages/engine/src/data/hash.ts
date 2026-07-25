import type { CompiledGameData } from "./types.js";

/**
 * Deterministic content hash over compiled game data (Part 10).
 *
 * What contributes to the hash:
 *   - schemaVersion, gameVersion, physics.
 *   - Every actor, ability, loadout, enemy, weapon, projectile, pickup,
 *     environment and prefab definition, by value.
 *   - All gameplay-relevant numbers, strings, hitboxes, references, reaction
 *     tables and charge thresholds.
 *
 * What is deliberately excluded:
 *   - Functions and registry object identity (the compiled data stores only ids
 *     and validated values — never the resolved registry entries).
 *   - Studio-facing presentation metadata (labels, colours, layout), which never
 *     lives in engine game data in the first place.
 *
 * The hash is a function of the canonical value only, so two builds that produce
 * value-equal compiled data produce the same hash regardless of Map insertion
 * order — the maps are already id-sorted, and the canonical serializer sorts
 * object keys besides.
 */
export function hashGameData(data: CompiledGameData): string {
  const canonical = {
    schemaVersion: data.schemaVersion,
    gameVersion: data.gameVersion,
    physics: data.physics,
    actors: fromMap(data.actors),
    abilities: fromMap(data.abilities),
    loadouts: fromMap(data.loadouts),
    enemies: fromMap(data.enemies),
    // resolvedProjectiles is derived from projectiles; drop it to avoid double-counting.
    weapons: fromMap(data.weapons).map(({ resolvedProjectiles: _drop, ...w }) => w),
    projectiles: fromMap(data.projectiles),
    pickups: fromMap(data.pickups),
    environments: fromMap(data.environments),
    prefabs: fromMap(data.prefabs),
  };
  return fnv1a64(stableStringify(canonical));
}

function fromMap<T>(map: ReadonlyMap<string, T>): T[] {
  return [...map.values()];
}

/** JSON with recursively sorted object keys — arrays keep their order. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/**
 * 64-bit FNV-1a as 16 hex chars, computed with BigInt so the whole 64-bit space
 * is used (a 32-bit hash collides too readily to gate replay compatibility on).
 */
function fnv1a64(text: string): string {
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}
