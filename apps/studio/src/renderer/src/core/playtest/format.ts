import type { ActorSnapshot, Vec2Snapshot } from "@mmx/editor-runtime";

export function fmtNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

export function fmtVec(v: Vec2Snapshot): string {
  return `${fmtNumber(v.x)}, ${fmtNumber(v.y)}`;
}

export function fmtPosition(actor: ActorSnapshot): string {
  return `${fmtNumber(actor.bounds.x + actor.bounds.w / 2)}, ${fmtNumber(
    actor.bounds.y + actor.bounds.h / 2,
  )}`;
}

export function fmtHealth(health?: number, maxHealth?: number): string {
  if (health === undefined) return "—";
  return maxHealth === undefined ? String(health) : `${health} / ${maxHealth}`;
}

export function fmtAbilities(abilities: readonly string[]): string {
  return abilities.length > 0 ? abilities.join(", ") : "—";
}
