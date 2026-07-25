import type { ActorSnapshot, Vec2Snapshot } from "@mmx/engine/tooling";

/**
 * Pure formatting helpers for the runtime inspector. Kept out of the React
 * component so they can be unit-tested headlessly, and so the "missing optional
 * value" rendering (an actor with no health, an idle state) has one definition.
 */

/** Whole numbers stay whole; fractions show two decimals. */
export function fmtNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function fmtVec(v: Vec2Snapshot): string {
  return `${fmtNumber(v.x)}, ${fmtNumber(v.y)}`;
}

/** Centre of an actor's bounds — what the inspector shows as "position". */
export function fmtPosition(actor: ActorSnapshot): string {
  return `${fmtNumber(actor.bounds.x + actor.bounds.w / 2)}, ${fmtNumber(
    actor.bounds.y + actor.bounds.h / 2,
  )}`;
}

/** "24 / 32", "24", or "—" when the actor carries no health. */
export function fmtHealth(health?: number, maxHealth?: number): string {
  if (health === undefined) return "—";
  return maxHealth === undefined ? String(health) : `${health} / ${maxHealth}`;
}

/** Comma-joined active abilities, or "—" when idle. */
export function fmtAbilities(abilities: string[]): string {
  return abilities.length > 0 ? abilities.join(", ") : "—";
}
