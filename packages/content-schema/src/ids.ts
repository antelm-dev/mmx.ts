/**
 * Stable instance-id generation. Mirrors the LDtk `iid` shape (a UUID) so an
 * editor-created object round-trips through {@link import("./types.js").LevelDocument}
 * and the engine exactly like an LDtk-authored one.
 */

let counter = 0;

/** RFC-4122-ish v4 id. Uses crypto.randomUUID when present, else a seeded fallback. */
export function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Deterministic-enough fallback for non-crypto environments (older Node in CI).
  counter += 1;
  const rand = () =>
    Math.floor(Math.random() * 0x10000)
      .toString(16)
      .padStart(4, "0");
  return `${rand()}${rand()}-${rand()}-4${rand().slice(1)}-8${rand().slice(1)}-${rand()}${rand()}${counter.toString(16).padStart(4, "0")}`;
}
